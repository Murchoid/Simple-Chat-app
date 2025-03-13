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
const Conversation = require('./models/Conversation');
const Message = require('./models/Message');
const MessageRequest = require('./models/messageRequest');

// Add cors configuration
app.use(cors({
    origin: 'http://localhost:4000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
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
    try {
        console.log('Registration request received:', req.body); // Debug log

        const { username, password } = req.body;
        
        // Validate input
        if (!username || !password) {
            return res.status(400).json({ message: 'Username and password are required' });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ username });
        console.log('Existing user check:', existingUser); // Debug log
        
        if (existingUser) {
            return res.status(400).json({ message: 'Username already exists' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create new user
        const user = new User({
            username,
            password: hashedPassword
        });

        console.log('Attempting to save user:', user); // Debug log

        // Save user to database
        const savedUser = await user.save();
        console.log('User saved successfully:', savedUser); // Debug log

        res.status(201).json({
            message: 'Registration successful',
            user: {
                _id: savedUser._id,
                username: savedUser.username
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            message: 'Error registering user',
            error: error.message
        });
    }
});

app.post('/login', passport.authenticate('local'), (req, res) => {
    console.log('Login successful for user:', req.user.username);
    res.json({
        user: {
            _id: req.user._id,
            username: req.user.username
        }
    });
});

app.get('/logout', (req, res) => {
    req.logout(() => {
        res.json({ message: 'Logout successful' });
    });
});

// Example middleware to check if user can message another user
async function canMessageUser(req, res, next) {
    const targetUser = await User.findById(req.params.userId);
    const currentUser = req.user;

    // Check if target user exists
    if (!targetUser) {
        return res.status(404).json({ message: 'User not found' });
    }

    // Check messaging privacy settings
    switch (targetUser.messagePrivacy) {
        case 'everyone':
            return next();
            
        case 'followers':
            if (targetUser.followers.includes(currentUser._id)) {
                return next();
            }
            break;
            
        case 'mutualFollowers':
            if (targetUser.followers.includes(currentUser._id) && 
                currentUser.followers.includes(targetUser._id)) {
                return next();
            }
            break;
    }

    // Check if there's an accepted message request
    const messageRequest = await MessageRequest.findOne({
        from: currentUser._id,
        to: targetUser._id,
        status: 'accepted'
    });

    if (messageRequest) {
        return next();
    }

    return res.status(403).json({ 
        message: 'You cannot message this user directly' 
    });
}

// Socket.IO event handlers (only for authenticated users)
io.on('connect', socket => {
    if (!socket.handshake.session.passport?.user) {
        socket.disconnect();
        return;
    }

    const userId = socket.handshake.session.passport.user;
    
    // Join user to their personal room
    socket.join(userId);
    
    socket.on('join_conversation', (conversationId) => {
        // Leave previous conversations
        socket.rooms.forEach(room => {
            if (room !== socket.id && room !== userId) {
                socket.leave(room);
            }
        });
        
        // Join new conversation room
        socket.join(conversationId);
        console.log(`User ${userId} joined conversation ${conversationId}`);
    });

    socket.on('send_message', async ({ conversationId, content }) => {
        try {
            const message = new Message({
                conversation: conversationId,
                sender: userId,
                content,
                type: 'text'
            });
            
            await message.save();
            
            // Update conversation's last message
            await Conversation.findByIdAndUpdate(conversationId, {
                lastMessage: message._id,
                lastMessageDate: new Date()
            });
            
            // Get conversation participants
            const conversation = await Conversation.findById(conversationId);
            
            // Emit to all participants
            conversation.participants.forEach(participantId => {
                io.to(participantId.toString()).emit('receive_message', {
                    content: message.content,
                    sender: userId,
                    conversationId
                });
            });
            
        } catch (error) {
            console.error('Error sending message:', error);
            socket.emit('message_error', { error: 'Failed to send message' });
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', userId);
    });
});

app.get('/api/conversations', async (req, res) => {
    try {
        // Check if user is authenticated
        if (!req.user) {
            return res.status(401).json({ message: 'Not authenticated' });
        }

        const conversations = await Conversation.find({
            participants: req.user._id
        })
        .populate('participants', 'username')
        .populate('lastMessage')
        .sort({ updatedAt: -1 });

        res.json(conversations);
    } catch (error) {
        console.error('Error fetching conversations:', error);
        res.status(500).json({ message: 'Error fetching conversations' });
    }
});



app.get('/api/message-requests/pending', async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Not authenticated' });
        }

        const requests = await MessageRequest.find({
            to: req.user._id,
            status: 'pending'
        }).populate('from', 'username');

        res.json(requests);
    } catch (error) {
        console.error('Error fetching message requests:', error);
        res.status(500).json({ message: 'Error fetching message requests' });
    }
});

app.get('/api/users/suggestions', async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Not authenticated' });
        }

        // Get users except the current user
        const users = await User.find({
            _id: { $ne: req.user._id }
        })
        .select('username')
        .limit(10);

        res.json(users);
    } catch (error) {
        console.error('Error fetching user suggestions:', error);
        res.status(500).json({ message: 'Error fetching user suggestions' });
    }
});

// Add this middleware function near your other middleware definitions
const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ message: 'Not authenticated' });
};

// The route will now work with the middleware
app.get('/api/users/search', isAuthenticated, async (req, res) => {
    try {
        const searchTerm = req.query.term;
        const users = await User.find({
            _id: { $ne: req.user._id },
            username: new RegExp(searchTerm, 'i')
        })
        .select('username avatar _id')
        .limit(10);

        // Ensure we're sending an array
        res.json(Array.isArray(users) ? users : []);
        
    } catch (error) {
        console.error('Error searching users:', error);
        res.status(500).json({ message: 'Error searching users' });
    }
});

// Add this route if not already present
app.get('/api/conversations/:conversationId/messages', async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Not authenticated' });
        }

        const messages = await Message.find({
            conversation: req.params.conversationId
        })
        .populate('sender', 'username')
        .sort({ createdAt: 1 });

        res.json(messages);
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ message: 'Error fetching messages' });
    }
});

// Add this route for creating/getting conversations
app.post('/api/conversations', async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Not authenticated' });
        }

        const { participantId } = req.body;

        // Check if conversation already exists between these users
        const existingConversation = await Conversation.findOne({
            participants: { 
                $all: [req.user._id, participantId],
                $size: 2
            }
        }).populate('participants', 'username avatar');

        if (existingConversation) {
            return res.json(existingConversation);
        }

        // If no existing conversation, create a new one
        const newConversation = new Conversation({
            participants: [req.user._id, participantId],
            lastMessageDate: new Date()
        });

        await newConversation.save();

        // Populate the participants info before sending response
        const populatedConversation = await Conversation
            .findById(newConversation._id)
            .populate('participants', 'username avatar');

        res.status(201).json(populatedConversation);

    } catch (error) {
        console.error('Error creating conversation:', error);
        res.status(500).json({ message: 'Error creating conversation' });
    }
});

http.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
