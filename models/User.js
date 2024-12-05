const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    isPrivate: {
        type: Boolean,
        default: false
    },
    followers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    following: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    messagePrivacy: {
        type: String,
        enum: ['everyone', 'followers', 'mutualFollowers'],
        default: 'everyone'
    }
});

module.exports = mongoose.model('User', userSchema); 