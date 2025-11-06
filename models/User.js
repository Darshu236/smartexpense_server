// models/User.js - Enhanced User Model with better userId generation
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  userId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  dateOfBirth: {
    type: Date
  },
  occupation: {
    type: String,
    trim: true
  },
  bio: {
    type: String,
    trim: true,
    maxlength: 500
  },
  address: {
    street: {
      type: String,
      trim: true
    },
    city: {
      type: String,
      trim: true
    },
    state: {
      type: String,
      trim: true
    },
    zipCode: {
      type: String,
      trim: true
    },
    country: {
      type: String,
      trim: true
    }
  },
  friends: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  profilePicture: {
    type: String,
    default: ''
  },
  // 2FA verification status
  isPhoneVerified: {
    type: Boolean,
    default: false
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  verificationTokens: {
    emailToken: String,
    phoneToken: String,
    emailTokenExpiry: Date,
    phoneTokenExpiry: Date
  },
  lastProfileUpdate: {
    type: Date
  },
  registrationDate: {
    type: Date,
    default: Date.now
  },
  lastLogin: {
    type: Date
  }
}, { 
  timestamps: true 
});

// Indexes for better performance
userSchema.index({ userId: 1 });
userSchema.index({ email: 1 });
userSchema.index({ phone: 1 });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Method to find user by credentials
userSchema.statics.findByCredentials = async function(email, password) {
  const user = await this.findOne({ email: email.toLowerCase() });
  
  if (!user) {
    throw new Error('Invalid login credentials');
  }
  
  const isMatch = await bcrypt.compare(password, user.password);
  
  if (!isMatch) {
    throw new Error('Invalid login credentials');
  }
  
  return user;
};

// Enhanced method to generate unique userId in format: username@myexpense
userSchema.statics.generateUserId = async function(preferredUsername = null) {
  let attempts = 0;
  const maxAttempts = 20;
  
  while (attempts < maxAttempts) {
    let baseUsername;
    
    if (preferredUsername && attempts === 0) {
      // Use provided username (cleaned) on first attempt
      baseUsername = preferredUsername
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '') // Remove non-alphanumeric characters
        .substring(0, 15); // Limit length
        
      // Ensure minimum length
      if (baseUsername.length < 3) {
        baseUsername += Math.random().toString(36).substring(2, 5);
      }
    } else {
      // Generate variations or random username
      if (preferredUsername && attempts < 10) {
        // Add numbers to preferred username
        const cleanBase = preferredUsername
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '')
          .substring(0, 12);
        baseUsername = cleanBase + (Math.floor(Math.random() * 999) + 1);
      } else {
        // Generate completely random username
        const randomPart = Math.random().toString(36).substring(2, 8);
        const numberPart = Math.floor(Math.random() * 99) + 10;
        baseUsername = 'user' + randomPart + numberPart;
      }
    }
    
    // Ensure username is not empty and meets minimum requirements
    if (!baseUsername || baseUsername.length < 3) {
      baseUsername = 'user' + Math.random().toString(36).substring(2, 8);
    }
    
    // Create userId in format: username@myexpense
    const userId = `${baseUsername}@myexpense`;
    
    // Check if this userId already exists
    const existingUser = await this.findOne({ userId });
    
    if (!existingUser) {
      console.log(`Generated unique userId: ${userId} (attempt ${attempts + 1})`);
      return userId;
    }
    
    console.log(`UserId ${userId} already exists, trying again... (attempt ${attempts + 1})`);
    attempts++;
  }
  
  // Fallback: use timestamp-based ID (guaranteed unique)
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  const fallbackId = `user${timestamp}${random}@myexpense`;
  
  console.log(`Using fallback userId: ${fallbackId}`);
  return fallbackId;
};

// Method to generate userId from name with better logic
userSchema.statics.generateUserIdFromName = async function(name) {
  if (!name || typeof name !== 'string') {
    return await this.generateUserId();
  }
  
  // Extract and clean potential username from name
  const words = name.trim().split(/\s+/);
  let baseUsername = '';
  
  if (words.length === 1) {
    // Single word - use as is
    baseUsername = words[0];
  } else if (words.length === 2) {
    // First name + Last name - combine first letters or use first name
    const firstName = words[0];
    const lastName = words[1];
    
    // Try first name first
    baseUsername = firstName;
    
    // If first name is too short, combine with last name initial
    if (firstName.length < 4 && lastName.length > 0) {
      baseUsername = firstName + lastName.charAt(0);
    }
  } else {
    // Multiple words - use first word primarily
    baseUsername = words[0];
    
    // If first word is too short, add more
    if (baseUsername.length < 4 && words[1]) {
      baseUsername += words[1];
    }
  }
  
  // Clean and format the username
  const cleanUsername = baseUsername
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') // Remove special characters
    .substring(0, 15); // Limit length
  
  return await this.generateUserId(cleanUsername);
};

// Method to validate userId format
userSchema.statics.isValidUserId = function(userId) {
  if (!userId || typeof userId !== 'string') {
    return { valid: false, reason: 'UserId must be a string' };
  }
  
  if (!userId.endsWith('@myexpense')) {
    return { valid: false, reason: 'UserId must end with @myexpense' };
  }
  
  const username = userId.replace('@myexpense', '');
  
  if (username.length < 3) {
    return { valid: false, reason: 'Username part must be at least 3 characters' };
  }
  
  if (username.length > 20) {
    return { valid: false, reason: 'Username part must not exceed 20 characters' };
  }
  
  if (!/^[a-z0-9]+$/.test(username)) {
    return { valid: false, reason: 'Username can only contain lowercase letters and numbers' };
  }
  
  // Check for reserved usernames
  const reservedUsernames = [
    'admin', 'root', 'administrator', 'support', 'help', 'api', 'www', 
    'mail', 'email', 'system', 'user', 'guest', 'test', 'demo',
    'myexpense', 'expense', 'app', 'web', 'server', 'database'
  ];
  
  if (reservedUsernames.includes(username.toLowerCase())) {
    return { valid: false, reason: 'This username is reserved and cannot be used' };
  }
  
  return { valid: true };
};

// Method to generate multiple userId suggestions
userSchema.statics.generateUserIdSuggestions = async function(name, count = 5) {
  const suggestions = [];
  const baseUsername = name ? 
    name.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 12) : 
    'user';
  
  // Generate different variations
  for (let i = 0; i < count; i++) {
    let suggestion;
    
    if (i === 0 && name) {
      // First suggestion: clean name
      suggestion = await this.generateUserId(baseUsername);
    } else if (i === 1 && name) {
      // Second suggestion: name + random number
      suggestion = await this.generateUserId(baseUsername + Math.floor(Math.random() * 999));
    } else {
      // Other suggestions: variations
      const randomSuffix = Math.floor(Math.random() * 9999);
      suggestion = await this.generateUserId(baseUsername + randomSuffix);
    }
    
    suggestions.push(suggestion);
  }
  
  return [...new Set(suggestions)]; // Remove duplicates
};

// Convert to JSON (exclude password and sensitive data)
userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  delete user.verificationTokens;
  return user;
};

// Method to check if user is fully verified
userSchema.methods.isFullyVerified = function() {
  return this.isEmailVerified && this.isPhoneVerified;
};

// Method to generate verification token
userSchema.methods.generateVerificationToken = function(type = 'email') {
  const token = Math.floor(100000 + Math.random() * 900000).toString();
  const expiryTime = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  
  if (!this.verificationTokens) {
    this.verificationTokens = {};
  }
  
  if (type === 'email') {
    this.verificationTokens.emailToken = token;
    this.verificationTokens.emailTokenExpiry = expiryTime;
  } else if (type === 'phone') {
    this.verificationTokens.phoneToken = token;
    this.verificationTokens.phoneTokenExpiry = expiryTime;
  }
  
  return token;
};

// Method to verify token
userSchema.methods.verifyToken = function(token, type = 'email') {
  if (!this.verificationTokens) {
    return { valid: false, reason: 'No verification tokens found' };
  }
  
  let storedToken, expiry;
  
  if (type === 'email') {
    storedToken = this.verificationTokens.emailToken;
    expiry = this.verificationTokens.emailTokenExpiry;
  } else if (type === 'phone') {
    storedToken = this.verificationTokens.phoneToken;
    expiry = this.verificationTokens.phoneTokenExpiry;
  }
  
  if (!storedToken) {
    return { valid: false, reason: 'No token found for this type' };
  }
  
  if (new Date() > expiry) {
    return { valid: false, reason: 'Token has expired' };
  }
  
  if (storedToken !== token) {
    return { valid: false, reason: 'Invalid token' };
  }
  
  return { valid: true };
};

// Static method to find user by userId or email
userSchema.statics.findByIdentifier = async function(identifier) {
  // Try to find by userId first
  let user = await this.findOne({ userId: identifier });
  
  // If not found and identifier looks like email, try email
  if (!user && identifier.includes('@') && !identifier.includes('@myexpense')) {
    user = await this.findOne({ email: identifier.toLowerCase() });
  }
  
  return user;
};

// Pre-save middleware to ensure userId format
userSchema.pre('save', function(next) {
  if (this.userId && !this.userId.endsWith('@myexpense')) {
    const username = this.userId.toLowerCase().replace(/[^a-z0-9]/g, '');
    this.userId = username + '@myexpense';
  }
  next();
});

export default mongoose.model('User', userSchema);

