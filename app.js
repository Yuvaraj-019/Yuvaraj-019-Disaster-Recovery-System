const express = require('express');
const { MongoClient } = require('mongodb');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');

const app = express();
const port = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false,
}));

// Compression middleware
app.use(compression());

// CORS configuration
app.use(cors());

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// MongoDB connection configuration
const mongoUri = 'mongodb://localhost:27017';
const dbName = 'disasterRecoveryDB';

// Global MongoDB client with connection pooling
let db = null;
let client = null;

// Connect to MongoDB with retry logic
async function connectDB(retries = 5) {
    if (db) return true;
    
    for (let i = 0; i < retries; i++) {
        try {
            client = new MongoClient(mongoUri, {
                serverSelectionTimeoutMS: 5000,
                socketTimeoutMS: 5000,
            });
            await client.connect();
            db = client.db(dbName);
            console.log('✅ Connected to MongoDB');
            return true;
        } catch (error) {
            console.log(`MongoDB connection attempt ${i + 1}/${retries} failed:`, error.message);
            if (i < retries - 1) await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    console.error('❌ MongoDB connection failed after all retries');
    db = null;
    client = null;
    return false;
}

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API: Get system status
app.get('/api/status', async (req, res) => {
    try {
        const isConnected = await connectDB();
        
        if (!isConnected) {
            return res.json({ 
                status: 'disconnected', 
                message: 'Cannot connect to MongoDB',
                timestamp: new Date().toISOString()
            });
        }

        const criticalDataCount = await db.collection('criticalData').countDocuments();
        const usersCount = await db.collection('users').countDocuments();
        
        // Get disk usage
        const diskUsage = await new Promise((resolve) => {
            exec('df -h /mongodb 2>/dev/null || df -h /', (error, stdout) => {
                if (error) resolve('Unable to get disk usage');
                else {
                    const lines = stdout.trim().split('\n');
                    resolve(lines[lines.length - 1] || 'N/A');
                }
            });
        });

        // Get latest backup info
        const backupInfo = await new Promise((resolve) => {
            exec('aws s3 ls s3://disaster-recovery-backups-project/mongodb-backups/ --human-readable | tail -1', 
            (error, stdout) => {
                if (error || !stdout.trim()) resolve('No backups found');
                else resolve(stdout.trim());
            });
        });

        res.json({
            status: 'connected',
            database: {
                criticalData: criticalDataCount,
                users: usersCount,
                totalRecords: criticalDataCount + usersCount
            },
            system: {
                diskUsage: diskUsage,
                timestamp: new Date().toISOString()
            },
            backups: {
                latest: backupInfo
            }
        });

    } catch (error) {
        console.error('Status API error:', error);
        res.status(500).json({ 
            status: 'error', 
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// API: Get all data
app.get('/api/data', async (req, res) => {
    try {
        const isConnected = await connectDB();
        if (!isConnected) {
            return res.status(500).json({ error: 'Database not available' });
        }

        const criticalData = await db.collection('criticalData').find()
            .sort({ timestamp: -1 }).limit(100).toArray();
        const users = await db.collection('users').find()
            .sort({ created_at: -1 }).limit(100).toArray();
        
        res.json({
            success: true,
            criticalData,
            users,
            counts: {
                criticalData: criticalData.length,
                users: users.length,
                total: criticalData.length + users.length
            }
        });
    } catch (error) {
        console.error('Data API error:', error);
        res.status(500).json({ error: error.message });
    }
});

// API: Add sample data
app.post('/api/data', async (req, res) => {
    try {
        const isConnected = await connectDB();
        if (!isConnected) {
            return res.status(500).json({ error: 'Database not available' });
        }

        const { type, name, value } = req.body;
        
        let result;
        if (type === 'critical') {
            result = await db.collection('criticalData').insertOne({
                name: name || `Test Data ${Date.now()}`,
                value: value || `Value ${Math.random().toString(36).substr(2, 5)}`,
                timestamp: new Date(),
                importance: 'medium',
                createdBy: 'web-app'
            });
        } else if (type === 'user') {
            result = await db.collection('users').insertOne({
                username: name || `user_${Math.random().toString(36).substr(2, 5)}`,
                email: value || `test${Date.now()}@company.com`,
                department: 'IT',
                created_at: new Date(),
                last_login: new Date(),
                createdBy: 'web-app'
            });
        } else {
            return res.status(400).json({ error: 'Invalid data type. Use "critical" or "user"' });
        }

        res.json({ 
            success: true, 
            insertedId: result.insertedId,
            message: 'Data added successfully'
        });
    } catch (error) {
        console.error('Add Data API error:', error);
        res.status(500).json({ error: error.message });
    }
});

// API: Create backup
app.post('/api/backup', (req, res) => {
    console.log('📦 Backup requested via API');
    exec('cd /home/ubuntu/disaster-recovery-system/scripts && ./full-backup.sh', 
        { timeout: 120000 },
        (error, stdout, stderr) => {
            if (error) {
                console.error('Backup failed:', error);
                return res.status(500).json({ 
                    success: false, 
                    error: error.message,
                    output: stdout + stderr
                });
            }
            console.log('✅ Backup completed via API');
            res.json({ 
                success: true, 
                message: 'Backup created successfully!',
                output: stdout
            });
        });
});

// API: Simulate disaster
app.post('/api/simulate-disaster', async (req, res) => {
    console.log('🔥 Disaster simulation requested via API');
    
    try {
        const isConnected = await connectDB();
        if (!isConnected) {
            return res.status(500).json({ 
                success: false, 
                error: 'Database not available' 
            });
        }

        // Record counts before deletion
        const criticalBefore = await db.collection('criticalData').countDocuments();
        const usersBefore = await db.collection('users').countDocuments();
        
        // DELETE ALL DATA
        await db.collection('criticalData').deleteMany({});
        await db.collection('users').deleteMany({});
        
        // Verify deletion
        const criticalAfter = await db.collection('criticalData').countDocuments();
        const usersAfter = await db.collection('users').countDocuments();
        
        console.log(`💀 Disaster simulated - Deleted ${criticalBefore + usersBefore} records`);
        
        res.json({ 
            success: true, 
            message: 'DISASTER SIMULATED! All data has been deleted.',
            before: {
                criticalData: criticalBefore,
                users: usersBefore,
                total: criticalBefore + usersBefore
            },
            after: {
                criticalData: criticalAfter,
                users: usersAfter,
                total: criticalAfter + usersAfter
            },
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Disaster simulation error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// API: Restore from backup
app.post('/api/restore', (req, res) => {
    const { backupFile } = req.body;
    
    if (!backupFile) {
        return res.status(400).json({ error: 'Backup file name is required' });
    }

    console.log(`🔄 Restore requested for: ${backupFile}`);
    
    exec(`cd /home/ubuntu/disaster-recovery-system/scripts && ./restore-backup.sh "${backupFile}"`, 
        { timeout: 300000 },
        (error, stdout, stderr) => {
            if (error) {
                console.error('Restore failed:', error);
                return res.status(500).json({ 
                    success: false, 
                    error: error.message,
                    details: stderr || stdout
                });
            }
            console.log('✅ Restore completed via API');
            res.json({ 
                success: true, 
                message: 'Restore completed successfully!',
                output: stdout
            });
        });
});

// API: List available backups
app.get('/api/backup-list', (req, res) => {
    exec('aws s3 ls s3://disaster-recovery-backups-project/mongodb-backups/ --human-readable | sort', 
        (error, stdout, stderr) => {
            if (error) {
                console.error('Backup list error:', error);
                return res.status(500).json({ error: error.message });
            }
            
            const backups = stdout.split('\n')
                .filter(line => line.trim() && line.includes('mongodb_full_backup_'))
                .map(line => {
                    const parts = line.split(/\s+/);
                    if (parts.length >= 4) {
                        return {
                            date: parts[0],
                            time: parts[1],
                            size: parts[2],
                            filename: parts.slice(3).join(' ')
                        };
                    }
                    return null;
                })
                .filter(backup => backup && backup.filename)
                .reverse();
                
            res.json({ success: true, backups });
        });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        service: 'Disaster Recovery System',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// Start server
app.listen(port, '0.0.0.0', async () => {
    console.log('🚀 Disaster Recovery System Starting...');
    console.log(`📊 Web interface: http://0.0.0.0:${port}`);
    console.log(`💚 Health check: http://0.0.0.0:${port}/health`);
    
    await connectDB();
    
    console.log('\n✅ System ready!');
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down gracefully...');
    if (client) await client.close();
    console.log('✅ Connections closed');
    process.exit(0);
});

module.exports = app;
