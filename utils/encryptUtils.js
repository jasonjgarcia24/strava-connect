// encryption.js
const crypto = require('crypto');
require('dotenv').config();


class SecureEncryption {
    #masterKey = null;
    #keyLength = 32;
    #tempBuffers = new Set();   // Track all temp buffers
    #isDestroyed = false;


    constructor(source) {
        this.algorithm = 'aes-256-gcm';
        this.keyLength = 32; // 256 bits
        this.ivLength = 12; // 96 bits for GCM (not 16!)
        this.saltLength = 32; // 256 bits
        this.tagLength = 16; // 128 bits
        this.iterations = 100000; // PBKDF2 iterations

        this.#setMasterKey(source);
    }

    #setMasterKey(source) {
        const envVarName = `${source.toUpperCase()}_ENCRYPTION_KEY`;
        const envKey = process.env[envVarName];

        if (!envKey) {
            throw new Error(`Environment variable ${envVarName} not set`);
        }
        
        try {
            // Ensure this creates a Buffer
            this.#masterKey = Buffer.from(envKey, 'base64');
            
            if (this.#masterKey.length !== this.#keyLength) {
                throw new Error(`Invalid key length for ${envVarName}. Expected ${this.#keyLength} bytes.`);
            }
        } catch (error) {
            throw new Error(`Invalid ${envVarName} format: ${error.message}`);
        }
    }

    encrypt(plaintext = "") {
        if (this.#isDestroyed) {
            throw new Error('Object has been destroyed');
        }

        try {
            // Create temporary buffers for encryption process
            const saltBuffer = this.createTempBuffer(32);
            const ivBuffer = this.createTempBuffer(12);
            const plaintextBuffer = this.createTempBuffer(Buffer.byteLength(plaintext, 'utf8'));
            
            // Fill buffers with data
            crypto.randomFillSync(saltBuffer); // Fill with random salt
            crypto.randomFillSync(ivBuffer);   // Fill with random IV
            plaintextBuffer.write(plaintext, 'utf8'); // Write plaintext
            
            // Derive decryption key
            const derivedKey = this.#deriveKey(saltBuffer);
            
            // Create cipher
            const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, ivBuffer);
            
            // Encrypt
            let encrypted = cipher.update(plaintextBuffer);
            encrypted = Buffer.concat([encrypted, cipher.final()]);
            
            const authTag = cipher.getAuthTag();
            
            // Combine results
            const result = Buffer.concat([saltBuffer, ivBuffer, authTag, encrypted]);
            
            // Clear sensitive temporary data immediately
            this.clearBuffer(plaintextBuffer); // Clear plaintext from memory
            this.clearBuffer(derivedKey);      // Clear derived key
            
            return result.toString('base64');
        }
        catch (error) {
            console.log(error);

            // Clean up on error
            this.clearAllTempBuffers();
            throw new Error(`Encryption failed: ${error.message}`);
        }
    }

    decrypt(encryptedData) {
        if (this.#isDestroyed) {
            throw new Error('Object has been destroyed');
        }

        try {
            const data = Buffer.from(encryptedData, 'base64');
            
            // Create temporary buffers for decryption components
            const saltBuffer = this.createTempBuffer(32);
            const ivBuffer = this.createTempBuffer(12);
            const authTagBuffer = this.createTempBuffer(16);
            const encryptedBuffer = this.createTempBuffer(data.length - 60); // Total - salt - iv - tag
            
            // Extract components into temporary buffers
            data.copy(saltBuffer, 0, 0, 32);           // Extract salt
            data.copy(ivBuffer, 0, 32, 44);            // Extract IV
            data.copy(authTagBuffer, 0, 44, 60);       // Extract auth tag
            data.copy(encryptedBuffer, 0, 60);         // Extract encrypted data
            
            // Derive decryption key
            const derivedKey = this.#deriveKey(saltBuffer);
            
            // Create decipher
            const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, ivBuffer);
            decipher.setAuthTag(authTagBuffer);
            
            // Decrypt
            let decrypted = decipher.update(encryptedBuffer);
            decrypted = Buffer.concat([decrypted, decipher.final()]);
            
            const result = decrypted.toString('utf8');
            
            // Clear all sensitive temporary data
            this.clearBuffer(derivedKey);
            this.clearBuffer(decrypted);
            
            return result;
        }
        catch (error) {
            // Clean up on error
            this.clearAllTempBuffers();
            console.log('ERROR')
            throw new Error(`Decryption failed: ${error.message}`);
        }
    }

    // Generate a derived key using PBKDF2
    #deriveKey(saltBuffer) {
        // Create temporary buffer for derived key
        const derivedKeyBuffer = this.createTempBuffer(32);
        
        // Use crypto.pbkdf2Sync to fill the buffer directly
        const derivedKey = crypto.pbkdf2Sync(
            this.#masterKey, 
            saltBuffer, 
            100000, 
            32, 
            'sha256'
        );
        
        // Copy to our tracked buffer
        derivedKey.copy(derivedKeyBuffer);
        
        // Clear the untracked derived key
        derivedKey.fill(0);
        
        return derivedKeyBuffer;
    }

    // Secure key generation utility
    static generateKey() {
        return crypto.randomBytes(32).toString('base64');
    }

    // Track temporary buffers for cleanup
    createTempBuffer(size) {
        if (this.#isDestroyed) {
            throw new Error('Object has been destroyed');
        }

        const buffer = Buffer.alloc(size);
        this.#tempBuffers.add(buffer);

        return buffer;
    }

    // Clear a specific buffer
    clearBuffer(buffer) {
        if (buffer && Buffer.isBuffer(buffer)) {
            buffer.fill(0);
        }

        this.#tempBuffers.delete(buffer);
    }

    // Clear all temporary buffers
    clearAllTempBuffers() {
        this.#tempBuffers.forEach(buffer => {
            if (buffer && Buffer.isBuffer(buffer)) {
                buffer.fill(0);
            }
        })
        this.#tempBuffers.clear();
    }

    // Securely clear sensitive data from memory
    clearKey() {
        if (this.#masterKey) {
        this.#masterKey.fill(0);
        }
    }

    // Secure object destruction
    destroy() {
        if (this.#isDestroyed) return;

        // Clear master key
        if (this.#masterKey) {

            this.#masterKey.fill(0);
            this.#masterKey = null;
        }

        // Clear all temp buffers
        this.clearAllTempBuffers();

        // Clear all properties
        Object.keys(this).forEach(key => {
            if (key !== 'isDestroyed') {
                this[key] = null;
            }
        });

        this.#isDestroyed = true;

        // Hint for garbage collection
        if (global.gc) {
            global.gc();
        }
    }

    // Ensure cleanup happens
    [Symbol.dispose]() {
        this.destroy();
    }
}

module.exports = SecureEncryption;