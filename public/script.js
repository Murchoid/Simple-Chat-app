let socket = null; // Global socket variable
let currentUsername = null; // Add this at the top of your file
let currentUserId;

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
        showLoading();
        const response = await fetch('/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password })
        });
        
        if (!response.ok) throw new Error('Login failed');
        
        const data = await response.json();
        currentUsername = data.user.username;
        currentUserId = data.user._id;
        
        // Initialize socket
        await initializeSocket();
        
        // Fetch user data (conversations, requests, etc.)
        await loadInitialData();
        
        hideLoading();
        showMainInterface();
        return data;
    } catch (error) {
        hideLoading();
        throw error;
    }
}

// Function to initialize socket connection
async function initializeSocket() {
    socket = io({
        withCredentials: true
    });

    // Handle connection
    socket.on('connect', () => {
        console.log('Connected to Socket.IO');
    });

    // Handle incoming messages
    socket.on('receive_message', (data) => {
        console.log('Received message:', data);
        
        // Get the current active conversation ID
        const activeConversation = document.querySelector('.chat-messages')
            ?.getAttribute('data-conversation-id');
            
        // Update messages if we're in the relevant conversation
        if (activeConversation === data.conversationId) {
            const chatMessages = document.querySelector('.chat-messages');
            const messageElement = document.createElement('div');
            messageElement.classList.add('message');
            messageElement.classList.add(data.sender === currentUserId ? 'sent' : 'received');
            messageElement.textContent = data.content;
            chatMessages.appendChild(messageElement);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
        
        // Update conversations list to show latest message
        loadInitialData();
    });

    // Handle typing status
    socket.on('typing_status', (data) => {
        const typingStatus = document.getElementById('typing-status');
        if (typingStatus) {
            typingStatus.textContent = data.isTyping ? `${data.user} is typing...` : '';
        }
    });
}

// Function to setup socket events (separated for clarity)
function setupSocketEvents() {
    

    // Handle message reception
    socket.on('receive_message', (data) => {
        console.log('Received message data:', data); // Debug log
        
        const chatMessages = document.querySelector('.chat-messages');
        if (chatMessages) {
            const messageElement = document.createElement('div');
            messageElement.classList.add('message');
            
            // Check if the message is from the current user
            if (data.sender === currentUserId) {
                messageElement.classList.add('sent');
            } else {
                messageElement.classList.add('received');
            }
            
            // Display the message content
            messageElement.textContent = data.content;
            
            chatMessages.appendChild(messageElement);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    });

    // Add typing status listener
    socket.on('typing_status', (data) => {
        console.log('Received typing status:', data);
        const typingStatus = document.getElementById('typing-status');
        
        if (typingStatus) {
            if (data.isTyping) {
                typingStatus.textContent = `${data.user} is typing...`;
                typingStatus.style.display = 'block';
            } else {
                typingStatus.style.display = 'none';
                typingStatus.textContent = '';
            }
        } else {
            console.error('Typing status element not found');
        }
    });

    
    setupTypingEvents();

    // Add form submit handler
    const form = document.getElementById('form');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault(); // Prevent page refresh
            const input = document.getElementById('input');
            
            if (input.value) {
                socket.emit('send_message', input.value);
                input.value = '';
            }
        });
    } else {
        console.error('Form element not found');
    }
}

// Update the typing events function
function setupTypingEvents() {
    const input = document.getElementById('input');
    console.log('Setting up typing events. Input element:', input);

    if (input) {
        let typingTimeout;
        
        input.addEventListener('input', (e) => {
            console.log('Input event triggered');
            if (!socket) {
                console.log('No socket connection');
                return;
            }
            
            const typingData = { isTyping: true };
            console.log('Emitting typing event with data:', typingData);
            socket.emit('typing', typingData);
            
            clearTimeout(typingTimeout);
            
            typingTimeout = setTimeout(() => {
                const stoppedTypingData = { isTyping: false };
                console.log('Emitting stopped typing event with data:', stoppedTypingData);
                socket.emit('typing', stoppedTypingData);
            }, 1000);
        });
    } else {
        console.error('Input element not found for typing events');
    }
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
    
    // Setup typing events after chat section is visible
    setTimeout(() => {
        setupTypingEvents();
    }, 100);
}

function showRegisterSection() {
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('chatSection').style.display = 'none';
    document.getElementById('registerSection').style.display = 'block';
}

// Event listeners for UI
document.getElementById('showRegister').addEventListener('click', showRegisterSection);
document.getElementById('showLogin').addEventListener('click', showLoginSection);

// Add loading overlay show/hide functions
function showLoading() {
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.id = 'loadingOverlay';
    
    const spinner = document.createElement('div');
    spinner.className = 'spinner';
    
    overlay.appendChild(spinner);
    document.body.appendChild(overlay);
    overlay.style.display = 'flex';
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.remove();
    }
}

// Update login form handler
document.getElementById('loginForm').addEventListener('submit', function(e) {
    e.preventDefault();
    // Simulate successful login
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('chatSection').style.display = 'block';
    showWelcomeModal(); // Show the welcome modal on first login
});

// Registration form handler
document.getElementById('registerForm').addEventListener('submit', function(e) {
    e.preventDefault();
    // Simulate successful registration
    document.getElementById('registerSection').style.display = 'none';
    document.getElementById('chatSection').style.display = 'block';
    showWelcomeModal(); // Show the welcome modal on first registration
});

// Toggle between login and register forms
document.getElementById('showRegister').addEventListener('click', function() {
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('registerSection').style.display = 'block';
});

document.getElementById('showLogin').addEventListener('click', function() {
    document.getElementById('registerSection').style.display = 'none';
    document.getElementById('loginSection').style.display = 'block';
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

// Load initial data after login
async function loadInitialData() {
    try {
        // Fetch conversations
        const conversationsResponse = await fetch('/api/conversations');
        if (!conversationsResponse.ok) {
            throw new Error('Failed to fetch conversations');
        }
        const conversations = await conversationsResponse.json();
        
        // Update UI
        const conversationsList = document.getElementById('conversationsList');
        if (conversations.length === 0) {
            conversationsList.innerHTML = `
                <div class="empty-state">
                    <p>No conversations yet</p>
                    <button id="findUsers">Find Users</button>
                </div>
            `;
        } else {
            updateConversationsList(conversations);
        }

    } catch (error) {
        console.error('Error loading initial data:', error);
        // Show a user-friendly error message in the UI
        const conversationsList = document.getElementById('conversationsList');
        conversationsList.innerHTML = `
            <div class="empty-state">
                <p>Error loading conversations</p>
                <button onclick="loadInitialData()">Retry</button>
            </div>
        `;
    }
}

// Show main interface
async function showMainInterface() {
    try {
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('registerSection').style.display = 'none';
        
        const chatSection = document.getElementById('chatSection');
        chatSection.style.display = 'block';

        // Setup event listeners after showing chat section
        setupEventListeners();
        
        // Load initial data
        await loadInitialData();

    } catch (error) {
        console.error('Error showing main interface:', error);
        alert('Error loading interface. Please try refreshing the page.');
    }
}

// Update conversations list
function updateConversationsList(conversations) {
    const conversationsList = document.getElementById('conversationsList');
    if (!conversationsList) return;
    
    if (conversations.length === 0) {
        conversationsList.innerHTML = `
            <div class="empty-state">
                <p>No conversations yet</p>
                <button id="findUsers">Find Users</button>
            </div>
        `;
        return;
    }
    
    conversationsList.innerHTML = conversations.map(conv => `
        <div class="conversation-item" data-id="${conv._id}">
            <img src="${conv.participants[0].avatar || 'default-avatar.png'}" alt="Avatar" class="avatar">
            <div class="conversation-info">
                <h4>${conv.participants[0].username}</h4>
                <p>${conv.lastMessage ? conv.lastMessage.content : 'Start a conversation'}</p>
            </div>
        </div>
    `).join('');
}

// Update message requests section
function updateMessageRequests(requests) {
    const requestsSection = document.getElementById('messageRequests');
    if (!requestsSection) return;
    
    if (requests.length > 0) {
        requestsSection.innerHTML = `
            <div class="requests-header">
                Message Requests (${requests.length})
            </div>
            ${requests.map(req => `
                <div class="request-item" data-id="${req._id}">
                    <img src="${req.from.avatar || 'default-avatar.png'}" alt="Avatar" class="avatar">
                    <div class="request-info">
                        <h4>${req.from.username}</h4>
                        <div class="request-actions">
                            <button class="accept-request">Accept</button>
                            <button class="decline-request">Decline</button>
                        </div>
                    </div>
                </div>
            `).join('')}
        `;
    } else {
        requestsSection.style.display = 'none';
    }
}

// Add this function to handle button click events
function setupEventListeners() {
    // Find Users and Start New Chat buttons
    document.body.addEventListener('click', (e) => {
        if (e.target.id === 'findUsers' || e.target.id === 'startNewChat') {
            const newMessageModal = document.getElementById('newMessageModal');
            if (newMessageModal) {
                newMessageModal.style.display = 'flex';
            } else {
                console.error('New message modal not found');
            }
        }
    });

    // Close modal button
    document.body.addEventListener('click', (e) => {
        if (e.target.className === 'close-modal') {
            const modals = document.querySelectorAll('.modal');
            modals.forEach(modal => modal.style.display = 'none');
        }
    });

    // User search input
    const userSearch = document.getElementById('userSearch');
    if (userSearch) {
        userSearch.addEventListener('input', async (e) => {
            const searchTerm = e.target.value;
            if (searchTerm.length < 1) {
                document.getElementById('searchResults').innerHTML = '';
                return;
            }
            
            try {
                const response = await fetch(`/api/users/search?term=${searchTerm}`);
                const users = await response.json();
                
                const searchResults = document.getElementById('searchResults');
                searchResults.innerHTML = users.map(user => `
                    <div class="search-result-item" data-user-id="${user._id}">
                        <img src="${user.avatar || 'default-avatar.png'}" alt="Avatar" class="avatar">
                        <span>${user.username}</span>
                    </div>
                `).join('');
            } catch (error) {
                console.error('Error searching users:', error);
            }
        });
    }

    // Add click handler for search results
    document.getElementById('searchResults').addEventListener('click', async (e) => {
        // Find the closest parent with class 'search-result-item'
        const resultItem = e.target.closest('.search-result-item');
        if (!resultItem) return;

        try {
            const userId = resultItem.dataset.userId;
            const username = resultItem.querySelector('span').textContent;

            // Create or get existing conversation
            const response = await fetch('/api/conversations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ participantId: userId })
            });

            if (!response.ok) {
                throw new Error('Failed to create conversation');
            }

            const conversation = await response.json();

            // Close the modal
            document.getElementById('newMessageModal').style.display = 'none';

            // Load the conversation
            loadConversation(conversation._id, username);

            // Refresh conversations list
            loadInitialData();

        } catch (error) {
            console.error('Error starting conversation:', error);
            alert('Failed to start conversation. Please try again.');
        }
    });

    // Add click handler for existing conversations
    const conversationsList = document.getElementById('conversationsList');
    if (conversationsList) {
        conversationsList.addEventListener('click', async (e) => {
            const conversationItem = e.target.closest('.conversation-item');
            if (!conversationItem) return;

            try {
                const conversationId = conversationItem.dataset.id;
                const username = conversationItem.querySelector('h4').textContent;

                // Remove active class from all conversations
                document.querySelectorAll('.conversation-item').forEach(item => {
                    item.classList.remove('active');
                });

                // Add active class to clicked conversation
                conversationItem.classList.add('active');

                // Load the conversation
                await loadConversation(conversationId, username);

            } catch (error) {
                console.error('Error loading conversation:', error);
                alert('Failed to load conversation. Please try again.');
            }
        });
    }
}

// Add function to load conversation
async function loadConversation(conversationId, username) {
    const chatArea = document.getElementById('chatArea');
    
    chatArea.innerHTML = `
        <div class="chat-header">
            <div class="chat-user-info">
                <span>${username}</span>
            </div>
        </div>
        <div class="chat-messages" data-conversation-id="${conversationId}"></div>
        <div id="typing-status" class="typing-status"></div>
        <form id="messageForm" class="chat-form">
            <input type="text" id="messageInput" placeholder="Type a message..." autocomplete="off">
            <button type="submit">Send</button>
        </form>
    `;

    // Join the conversation room
    socket.emit('join_conversation', conversationId);

    // Add submit handler for the message form
    const messageForm = document.getElementById('messageForm');
    messageForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('messageInput');
        const content = input.value.trim();

        if (content) {
            try {
                // Emit the message with the correct structure
                socket.emit('send_message', {
                    conversationId,
                    content
                });
                
                // Clear input after sending
                input.value = '';
                
            } catch (error) {
                console.error('Error sending message:', error);
                alert('Failed to send message. Please try again.');
            }
        }
    });

    // Load existing messages
    try {
        const response = await fetch(`/api/conversations/${conversationId}/messages`);
        if (!response.ok) throw new Error('Failed to load messages');
        
        const messages = await response.json();
        const messagesContainer = document.querySelector('.chat-messages');
        
        messages.forEach(message => {
            const messageElement = document.createElement('div');
            messageElement.classList.add('message');
            messageElement.classList.add(message.sender._id === currentUserId ? 'sent' : 'received');
            messageElement.textContent = message.content;
            messagesContainer.appendChild(messageElement);
        });

        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        // Join the conversation room
        socket.emit('join_conversation', conversationId);
        
    } catch (error) {
        console.error('Error loading messages:', error);
    }
}

// Show welcome modal
function showWelcomeModal() {
    const modal = document.getElementById('welcomeModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

// Hide modal when clicking outside or on close button
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.style.display = 'none';
    }
});

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded and parsed');

    // UI Elements
    const elements = {
        loginSection: document.getElementById('loginSection'),
        registerSection: document.getElementById('registerSection'),
        chatSection: document.getElementById('chatSection'),
        showRegisterBtn: document.getElementById('showRegister'),
        showLoginBtn: document.getElementById('showLogin'),
        loginForm: document.getElementById('loginForm'),
        registerForm: document.getElementById('registerForm'),
        getStartedBtn: document.getElementById('getStarted'),
        welcomeModal: document.getElementById('welcomeModal'),
        welcomeSteps: document.querySelectorAll('.welcome-steps .step'),
        conversationsSidebar: document.querySelector('.conversations-sidebar'),
        newMessageBtn: document.getElementById('newMessageBtn'),
        newMessageModal: document.getElementById('newMessageModal'),
        conversationsList: document.getElementById('conversationsList'),
        startNewChatBtn: document.getElementById('startNewChat'),
        searchResults: document.getElementById('searchResults'),
        userSearch: document.getElementById('userSearch')
    };

    // Simple function to handle button clicks without debounce
    function handleButtonClick(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const buttonId = e.target.id;
        console.log('Button clicked:', buttonId);

        switch(buttonId) {
            case 'showRegister':
                elements.loginSection.style.display = 'none';
                elements.registerSection.style.display = 'block';
                break;
            case 'showLogin':
                elements.registerSection.style.display = 'none';
                elements.loginSection.style.display = 'block';
                break;
            case 'getStarted':
                elements.welcomeModal.style.display = 'none';
                break;
        }
    }

    // Add click listeners directly
    elements.showRegisterBtn?.addEventListener('click', handleButtonClick);
    elements.showLoginBtn?.addEventListener('click', handleButtonClick);
    elements.getStartedBtn?.addEventListener('click', handleButtonClick);

    // Form handlers
    elements.loginForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        showChatSection();
        showWelcomeModal();
    });

    elements.registerForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        showChatSection();
        showWelcomeModal();
    });

    function showChatSection() {
        elements.loginSection.style.display = 'none';
        elements.registerSection.style.display = 'none';
        elements.chatSection.style.display = 'block';
        setupConversationsSidebar(); // Setup sidebar when showing chat section
        loadInitialData(); // Load conversations
    }

    function showWelcomeModal() {
        elements.welcomeModal.style.display = 'flex';
    }

    // Show initial section
    elements.loginSection.style.display = 'block';

    // Add handler for welcome steps
    function handleStepClick(e) {
        const step = e.currentTarget;
        const stepTitle = step.querySelector('h3').textContent;
        console.log('Step clicked:', stepTitle);

        // Remove active class from all steps
        elements.welcomeSteps.forEach(s => s.classList.remove('active'));
        
        // Add active class to clicked step
        step.classList.add('active');

        // Handle different steps
        switch(stepTitle) {
            case 'Find Friends':
                showFindFriendsSection();
                break;
            case 'Privacy Control':
                showPrivacySection();
                break;
            case 'Start Chatting':
                showChatSection();
                elements.welcomeModal.style.display = 'none';
                break;
        }
    }

    // Add click listeners to each step
    elements.welcomeSteps.forEach(step => {
        step.addEventListener('click', handleStepClick);
        // Add cursor pointer style
        step.style.cursor = 'pointer';
    });

    // Helper functions for each section
    function showFindFriendsSection() {
        console.log('Showing find friends section');
        // Add your logic for showing the find friends section
        const newMessageModal = document.getElementById('newMessageModal');
        if (newMessageModal) {
            elements.welcomeModal.style.display = 'none';
            newMessageModal.style.display = 'flex';
        }
    }

    function showPrivacySection() {
        console.log('Showing privacy section');
        // Add your logic for showing the privacy section
        // This could open a privacy settings modal or navigate to a settings page
    }

    // Add this function to handle the conversations sidebar
    function setupConversationsSidebar() {
        console.log('Setting up conversations sidebar');

        // Handle "New Message" button click
        if (elements.newMessageBtn) {
            elements.newMessageBtn.addEventListener('click', () => {
                console.log('New message button clicked');
                if (elements.newMessageModal) {
                    elements.newMessageModal.style.display = 'flex';
                }
            });
        }

        // Handle "Start New Chat" button click
        if (elements.startNewChatBtn) {
            elements.startNewChatBtn.addEventListener('click', () => {
                console.log('Start new chat button clicked');
                if (elements.newMessageModal) {
                    elements.newMessageModal.style.display = 'flex';
                }
            });
        }

        // Handle user search
        if (elements.userSearch) {
            elements.userSearch.addEventListener('input', async (e) => {
                const searchTerm = e.target.value;
                if (searchTerm.length < 1) {
                    elements.searchResults.innerHTML = '';
                    return;
                }
                
                try {
                    const response = await fetch(`/api/users/search?term=${searchTerm}`);
                    const users = await response.json();
                    
                    elements.searchResults.innerHTML = users.map(user => `
                        <div class="search-result-item" data-user-id="${user._id}">
                            <img src="${user.avatar || 'default-avatar.png'}" alt="Avatar" class="avatar">
                            <span>${user.username}</span>
                        </div>
                    `).join('');
                } catch (error) {
                    console.error('Error searching users:', error);
                }
            });
        }

        // Handle search result clicks
        if (elements.searchResults) {
            elements.searchResults.addEventListener('click', async (e) => {
                const resultItem = e.target.closest('.search-result-item');
                if (!resultItem) return;

                try {
                    const userId = resultItem.dataset.userId;
                    const username = resultItem.querySelector('span').textContent;

                    const response = await fetch('/api/conversations', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ participantId: userId })
                    });

                    if (!response.ok) {
                        throw new Error('Failed to create conversation');
                    }

                    const conversation = await response.json();
                    elements.newMessageModal.style.display = 'none';
                    loadConversation(conversation._id, username);
                    loadInitialData();

                } catch (error) {
                    console.error('Error starting conversation:', error);
                    alert('Failed to start conversation. Please try again.');
                }
            });
        }

        // Close modal button
        const closeButtons = document.querySelectorAll('.close-modal');
        closeButtons.forEach(button => {
            button.addEventListener('click', () => {
                const modals = document.querySelectorAll('.modal');
                modals.forEach(modal => modal.style.display = 'none');
            });
        });
    }

    // Add this function to load initial conversations
    async function loadInitialData() {
        try {
            const response = await fetch('/api/conversations');
            if (!response.ok) {
                throw new Error('Failed to fetch conversations');
            }
            const conversations = await response.json();
            
            if (elements.conversationsList) {
                if (conversations.length === 0) {
                    elements.conversationsList.innerHTML = `
                        <div class="empty-state">
                            <p>No conversations yet</p>
                            <button id="findUsers">Find Users</button>
                        </div>
                    `;
                } else {
                    elements.conversationsList.innerHTML = conversations.map(conv => `
                        <div class="conversation-item" data-id="${conv._id}">
                            <div class="conversation-info">
                                <h4>${conv.participants[0].username}</h4>
                                <p>${conv.lastMessage ? conv.lastMessage.content : 'No messages yet'}</p>
                            </div>
                        </div>
                    `).join('');
                }
            }
        } catch (error) {
            console.error('Error loading initial data:', error);
        }
    }
});
