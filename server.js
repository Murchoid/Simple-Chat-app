const express = require('express');
const cors = require('cors');
const app = express();
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: process.env.NODE_ENV === 'production' 
            ? true  // Allow all origins in production
            : 'http://localhost:4000',
        credentials: true,
        methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling']
});
const sharedSession = require('express-socket.io-session');
const mongoose = require('mongoose');
const User = require('./models/User');
const bcrypt = require('bcrypt');
require('dotenv').config();
const port = process.env.PORT || 4000;
const MongoStore = require('connect-mongo');

// Add cors configuration
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? true  // Allow all origins in production
        : 'http://localhost:4000',
    credentials: true
}));

mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('Connected to MongoDB');
}).catch(err => {
    console.error('MongoDB connection error:', err);
});

// Middleware
const sessionMiddleware = session({
    secret: process.env.SECRET_KEY,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGO_URI,
        ttl: 24 * 60 * 60, // Session TTL (1 day)
        autoRemove: 'native' // Enable automatic removal of expired sessions
    }),
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 1000 * 60 * 60 * 24 // 1 day
    }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());

// Share session with Socket.IO
io.use(sharedSession(sessionMiddleware, {
    autoSave: true
}));

// Mock user database (replace with real database)
const users = new Map();

// Passport configuration
passport.use(new LocalStrategy(
    async (username, password, done) => {
        try {
            const user = await User.findOne({ username });
            if (!user) return done(null, false, { message: 'User not found' });
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) return done(null, false, { message: 'Wrong password' });
            return done(null, user);
        } catch (error) {
            return done(error);
        }
    }
));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);

        done(null, user);
    } catch (error) {
        done(error);
    }
});

// Authentication Routes
const emojis = ["😎", "🥱", "🤠", "💀", "👽", "👾", "🐱‍👤", "🐲", "🤩", "😍", "🥰"];

app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    try {
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ message: 'Username already exists' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ username, password: hashedPassword });
        await user.save();
        res.json({ message: 'Registration successful' });
    } catch (error) {
        res.status(500).json({ message: 'Error registering user' });
    }
});

app.post('/login', passport.authenticate('local'), (req, res) => {
    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
    req.session.userEmoji = randomEmoji;
    res.json({ message: 'Login successful', user: req.user.username, emoji: randomEmoji });
});

app.get('/logout', (req, res) => {
    req.logout(() => {
        res.json({ message: 'Logout successful' });
    });
});

// Socket.IO event handlers (only for authenticated users)
io.on('connect', socket => {
    if (!socket.handshake.session.passport || !socket.handshake.session.passport.user) {
        socket.disconnect();
        return;
    }

    // Find the user by ID to get their username
    User.findById(socket.handshake.session.passport.user)
        .then(user => {
            socket.username = user.username;  // Use actual username instead of ID
            const userEmoji = socket.handshake.session.userEmoji || '👤'; // Provide default emoji
            console.log('A user connected:', socket.username);
            
            io.emit('receive_message', {
                user: 'System',
                emoji: '🤖',
                text: `${userEmoji + socket.username} has joined the chat`
            });
        })
        .catch(err => {
            console.error('Error finding user:', err);
            socket.disconnect();
        });

    socket.on('send_message', message => {
        const userEmoji = socket.handshake.session.userEmoji || '👤'; // Provide default emoji
        console.log(`Message received from ${socket.username} ${userEmoji}: ${message}`);
        io.emit('receive_message', {
            user: socket.username,
            emoji: userEmoji,
            text: message
        });
    });

    socket.on('video_control', (data) => {
        console.log('Video control received:', data);
        socket.broadcast.emit('video_control', data);
    });

    socket.on('disconnect', () => {
        if (socket.username) {
            const userEmoji = socket.handshake.session.userEmoji || '👤'; // Provide default emoji
            console.log('A user disconnected:', socket.username);
            io.emit('receive_message', {
                user: 'System',
                emoji: '🤖',
                text: `${userEmoji + socket.username} has left the chat`
            });
        }
    });

    socket.on('typing', (data) => {
        console.log('Server received typing event:', data); // Add debug log
        // Broadcast typing status to all other users
        socket.broadcast.emit('typing_status', {
            user: socket.username,
            isTyping: data.isTyping
        });
        console.log('Server emitted typing_status:', { user: socket.username, isTyping: data.isTyping }); // Add debug log
    });
});

http.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});