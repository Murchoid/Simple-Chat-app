let socket = null; // Global socket variable
let currentUsername = null; // Add this at the top of your file

// Add YouTube API
const tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
const firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

let players = {};  // Store YouTube player instances

// Function to create YouTube player after API is ready
function onYouTubeIframeAPIReady() {
    console.log('YouTube API is ready');
}

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
        currentUsername = data.user; // Store the username
        
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
        
        if (data.user === currentUsername) {
            messageElement.classList.add('sent');
            console.log('Message marked as sent');
        } else {
            messageElement.classList.add('received');
            console.log('Message marked as received');
        }
        
        // Check if message contains YouTube URL
        const words = data.text.split(' ');
        let messageText = data.text;
        
        words.forEach(word => {
            const videoId = getYouTubeVideoId(word.trim());
            console.log('Checking word:', word, 'Video ID:', videoId); // Debug log
            
            if (videoId) {
                // Create YouTube embed using iframe directly first
                const videoContainer = document.createElement('div');
                const playerId = `youtube-${Date.now()}`;
                videoContainer.innerHTML = `
                    <div class="youtube-embed">
                        <iframe 
                            id="${playerId}"
                            width="560" 
                            height="315" 
                            src="https://www.youtube.com/embed/${videoId}?enablejsapi=1" 
                            frameborder="0" 
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                            allowfullscreen>
                        </iframe>
                    </div>
                `;
                messageElement.appendChild(videoContainer);
                
                // After direct iframe embed, initialize the player
                const iframe = videoContainer.querySelector('iframe');
                iframe.id = playerId;
                
                // Initialize YT Player after a short delay to ensure iframe is loaded
                setTimeout(() => {
                    players[playerId] = new YT.Player(playerId, {
                        events: {
                            'onReady': (event) => {
                                console.log('Player ready:', playerId);
                            },
                            'onStateChange': (event) => onPlayerStateChange(event, playerId),
                            'onError': (event) => {
                                console.error('Player error:', event.data);
                            }
                        }
                    });
                }, 100);
            }
        });

        // Add the text part of the message
        const textNode = document.createElement('div');
        textNode.textContent = `${data.emoji + data.user}: ${messageText}`;
        messageElement.insertBefore(textNode, messageElement.firstChild);
        
        messages.appendChild(messageElement);
        messages.scrollTop = messages.scrollHeight;
        
        console.log('Message added to chat:', messageElement.textContent);
    });

    // Handle player state changes
    function onPlayerStateChange(event, playerId) {
        console.log('Player state changed:', event.data, 'for player:', playerId);
        socket.emit('video_control', {
            playerId: playerId,
            state: event.data,
            currentTime: event.target.getCurrentTime()
        });
    }

    // Listen for video control events from other users
    socket.on('video_control', (data) => {
        console.log('Received video control:', data);
        const player = players[data.playerId];
        if (player) {
            if (data.state === 1) { // Playing
                player.seekTo(data.currentTime);
                player.playVideo();
            } else if (data.state === 2) { // Paused
                player.pauseVideo();
            }
        }
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

// Improve the YouTube URL detection function
function getYouTubeVideoId(url) {
    // Handle various YouTube URL formats including playlists
    const patterns = [
        /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([^?&]+)/i,    // youtu.be format
        /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([^?&]+)/i,    // youtube.com/watch format
        /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([^?&]+)/i     // embed format
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) {
            // Clean up any additional parameters
            return match[1].split('?')[0];
        }
    }
    return null;
}