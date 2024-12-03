let socket = null; // Global socket variable
let currentUsername = null; // Add this at the top of your file

// Function to handle login
async function login(username, password) {
    try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password })
        });
        
        if (!response.ok) {
            throw new Error('Login failed');
        }
        
        const data = await response.json();
        currentUsername = data.emoji; // Store the username
        
        // Initialize socket only after successful login
        await initializeSocket();
        
        return data;
    } catch (error) {
        console.error('Login error:', error);
        throw error;
    }
}

// Function to initialize socket connection
async function initializeSocket() {
    // If socket exists and is connected, disconnect it first
    if (socket && socket.connected) {
        socket.disconnect();
    }

    return new Promise((resolve, reject) => {
        // Update the socket connection URL to be dynamic
        const socketURL = window.location.hostname === 'localhost' 
            ? 'http://localhost:4000'
            : window.location.origin;

        socket = io(socketURL, {
            withCredentials: true,
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: 5,
            transports: ['websocket', 'polling']
        });

        socket.on('connect', () => {
            console.log('Connected to server with socket ID:', socket.id);
            showChatSection();
            resolve();
        });

        socket.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
            if (error.message === 'Unauthorized') {
                showLoginSection();
            }
            reject(error);
        });

        setupSocketEvents();
    });
}

// Function to setup socket events (separated for clarity)
function setupSocketEvents() {
    const messages = document.getElementById('messages');
    const form = document.getElementById('form');
    const input = document.getElementById('input');

    // Debug log to verify elements are found
    console.log('Messages element:', messages);
    console.log('Form element:', form);
    console.log('Input element:', input);

    // Clear existing messages
    if (messages) {
        messages.innerHTML = '';
    }

    // Message handling
    if (form) {
        // Remove existing listeners before adding new ones
        const newForm = form.cloneNode(true);
        form.parentNode.replaceChild(newForm, form);
        
        newForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const input = newForm.querySelector('#input');
            if (input && input.value.trim()) {
                console.log('Attempting to send message:', input.value);
                socket.emit('send_message', input.value);
                console.log('Message emitted to server');
                input.value = '';
            }
        });
    }

    // Message reception
    socket.on('receive_message', (data) => {
        console.log('Received message data:', data);
        
        if (!messages) {
            console.error('Messages container not found!');
            return;
        }
    
        const messageElement = document.createElement('div');
        messageElement.classList.add('message');
        
        if (data.emoji === currentUsername) {
            messageElement.classList.add('sent');
            console.log('Message marked as sent');
        } else {
            messageElement.classList.add('received');
            console.log('Message marked as received');
        }
        
        messageElement.textContent = `${data.emoji}: ${data.text}`;
        messages.appendChild(messageElement);
        messages.scrollTop = messages.scrollHeight;
        
        console.log('Message added to chat:', messageElement.textContent);
    });
}

// UI helper functions
function showLoginSection() {
    document.getElementById('loginSection').style.display = 'block';
    document.getElementById('chatSection').style.display = 'none';
    document.getElementById('registerSection').style.display = 'none';
}

function showChatSection() {
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('chatSection').style.display = 'flex';
    document.getElementById('registerSection').style.display = 'none';
}

function showRegisterSection() {
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('chatSection').style.display = 'none';
    document.getElementById('registerSection').style.display = 'block';
}

// Event listeners for UI
document.getElementById('showRegister').addEventListener('click', showRegisterSection);
document.getElementById('showLogin').addEventListener('click', showLoginSection);

// Login form handler
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    try {
        await login(username, password);
        showChatSection();
    } catch (error) {
        alert('Login failed: ' + error.message);
    }
});

// Add registration functionality
async function register(username, password) {
    try {
        const response = await fetch('/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password })
        });
        
        if (!response.ok) throw new Error('Registration failed');
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Registration error:', error);
        throw error;
    }
}

// Toggle between login and register forms
document.getElementById('showRegister').addEventListener('click', () => {
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('registerSection').style.display = 'block';
});

document.getElementById('showLogin').addEventListener('click', () => {
    document.getElementById('registerSection').style.display = 'none';
    document.getElementById('loginSection').style.display = 'block';
});

// Handle register form submission
document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('regUsername').value;
    const password = document.getElementById('regPassword').value;
    
    try {
        await register(username, password);
        // After successful registration, switch to login form
        document.getElementById('registerSection').style.display = 'none';
        document.getElementById('loginSection').style.display = 'block';
        alert('Registration successful! Please login.');
    } catch (error) {
        alert('Registration failed');
    }
});