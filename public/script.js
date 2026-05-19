// API Base URL
const API_BASE = window.location.origin;

// Add log entry
function addLog(message, type = 'info') {
    const logDiv = document.getElementById('operationLog');
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry log-${type}`;
    logEntry.innerHTML = `[${new Date().toLocaleTimeString()}] ${message}`;
    logDiv.insertBefore(logEntry, logDiv.firstChild);
    
    // Keep only last 50 logs
    while (logDiv.children.length > 50) {
        logDiv.removeChild(logDiv.lastChild);
    }
}

// Refresh system status
async function refreshStatus() {
    try {
        addLog('Refreshing system status...', 'info');
        const response = await fetch(`${API_BASE}/api/status`);
        const data = await response.json();
        
        if (data.status === 'connected') {
            document.getElementById('dbStatus').innerHTML = 
                '<span class="status-badge status-connected">Connected</span>';
            document.getElementById('totalRecords').textContent = data.database.totalRecords;
            document.getElementById('criticalCount').textContent = data.database.criticalData;
            document.getElementById('usersCount').textContent = data.database.users;
            document.getElementById('lastChecked').textContent = new Date().toLocaleString();
            addLog(`Status refreshed - Total records: ${data.database.totalRecords}`, 'success');
        } else {
            document.getElementById('dbStatus').innerHTML = 
                '<span class="status-badge status-disconnected">Disconnected</span>';
            addLog('Database disconnected!', 'error');
        }
    } catch (error) {
        addLog(`Failed to refresh status: ${error.message}`, 'error');
    }
}

// Create backup
async function createBackup() {
    try {
        addLog('Creating backup...', 'info');
        const response = await fetch(`${API_BASE}/api/backup`, { method: 'POST' });
        const data = await response.json();
        
        if (data.success) {
            addLog('✅ Backup created successfully!', 'success');
            loadBackups();
            refreshStatus();
        } else {
            addLog(`❌ Backup failed: ${data.error}`, 'error');
        }
    } catch (error) {
        addLog(`❌ Backup error: ${error.message}`, 'error');
    }
}

// Add sample data
async function addSampleData() {
    try {
        addLog('Adding sample data...', 'info');
        
        // Add critical data
        const criticalResponse = await fetch(`${API_BASE}/api/data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'critical',
                name: `Sample Data ${Date.now()}`,
                value: 'Auto-generated sample data'
            })
        });
        
        // Add user
        const userResponse = await fetch(`${API_BASE}/api/data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'user',
                name: `demo_user_${Date.now()}`,
                value: `demo${Date.now()}@example.com`
            })
        });
        
        if (criticalResponse.ok && userResponse.ok) {
            addLog('✅ Sample data added successfully!', 'success');
            refreshStatus();
            loadCurrentData();
        } else {
            addLog('❌ Failed to add sample data', 'error');
        }
    } catch (error) {
        addLog(`❌ Error adding sample data: ${error.message}`, 'error');
    }
}

// Simulate disaster
async function simulateDisaster() {
    if (!confirm('⚠️ WARNING: This will DELETE ALL DATA! Are you sure you have a backup? Click OK to continue.')) {
        addLog('Disaster simulation cancelled', 'info');
        return;
    }
    
    try {
        addLog('🔥 SIMULATING DISASTER - Deleting all data...', 'error');
        const response = await fetch(`${API_BASE}/api/simulate-disaster`, { method: 'POST' });
        const data = await response.json();
        
        if (data.success) {
            addLog(`💀 DISASTER SIMULATED! Deleted ${data.before.total} records. Restore from backup immediately!`, 'error');
            refreshStatus();
            loadCurrentData();
        } else {
            addLog(`❌ Disaster simulation failed: ${data.error}`, 'error');
        }
    } catch (error) {
        addLog(`❌ Disaster simulation error: ${error.message}`, 'error');
    }
}

// Restore from backup
async function restoreBackup(backupFile) {
    if (!confirm(`⚠️ Restore database from ${backupFile}? This will replace current data.`)) {
        return;
    }
    
    try {
        addLog(`Starting restore from ${backupFile}...`, 'info');
        const response = await fetch(`${API_BASE}/api/restore`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ backupFile })
        });
        
        const data = await response.json();
        
        if (data.success) {
            addLog(`✅ Restore completed successfully! Database restored from ${backupFile}`, 'success');
            refreshStatus();
            loadCurrentData();
        } else {
            addLog(`❌ Restore failed: ${data.error}`, 'error');
        }
    } catch (error) {
        addLog(`❌ Restore error: ${error.message}`, 'error');
    }
}

// Load backups list
async function loadBackups() {
    try {
        const response = await fetch(`${API_BASE}/api/backup-list`);
        const data = await response.json();
        
        const backupDiv = document.getElementById('backupList');
        
        if (data.success && data.backups && data.backups.length > 0) {
            backupDiv.innerHTML = '';
            data.backups.forEach(backup => {
                const backupItem = document.createElement('div');
                backupItem.className = 'backup-item';
                backupItem.innerHTML = `
                    <div>
                        <strong>${backup.filename}</strong><br>
                        <small>Created: ${backup.date} ${backup.time} | Size: ${backup.size}</small>
                    </div>
                    <button onclick="restoreBackup('${backup.filename}')" class="btn btn-primary">Restore</button>
                `;
                backupDiv.appendChild(backupItem);
            });
            addLog(`Loaded ${data.backups.length} backups`, 'success');
        } else {
            backupDiv.innerHTML = '<p>No backups found. Create your first backup!</p>';
            addLog('No backups available', 'info');
        }
    } catch (error) {
        document.getElementById('backupList').innerHTML = '<p class="error">Error loading backups</p>';
        addLog(`Error loading backups: ${error.message}`, 'error');
    }
}

// Load current data from database
async function loadCurrentData() {
    try {
        addLog('Loading current data from database...', 'info');
        const response = await fetch(`${API_BASE}/api/data`);
        const data = await response.json();
        
        const dataDiv = document.getElementById('dataDisplay');
        
        if (data.success && (data.criticalData.length > 0 || data.users.length > 0)) {
            dataDiv.innerHTML = '';
            
            if (data.criticalData.length > 0) {
                dataDiv.innerHTML += '<h4>📊 Critical Data:</h4>';
                data.criticalData.forEach(record => {
                    dataDiv.innerHTML += `
                        <div class="data-record">
                            <strong>${record.name}</strong><br>
                            Value: ${record.value}<br>
                            <small>Created: ${new Date(record.timestamp).toLocaleString()}</small>
                        </div>
                    `;
                });
            }
            
            if (data.users.length > 0) {
                dataDiv.innerHTML += '<h4>👥 Users:</h4>';
                data.users.forEach(user => {
                    dataDiv.innerHTML += `
                        <div class="data-record">
                            <strong>${user.username}</strong><br>
                            Email: ${user.email}<br>
                            <small>Created: ${new Date(user.created_at).toLocaleString()}</small>
                        </div>
                    `;
                });
            }
            
            addLog(`Loaded ${data.counts.total} records from database`, 'success');
        } else {
            dataDiv.innerHTML = '<p>No data found in database. Click "Add Sample Data" to create test data.</p>';
            addLog('No data found in database', 'info');
        }
    } catch (error) {
        document.getElementById('dataDisplay').innerHTML = '<p class="error">Error loading data</p>';
        addLog(`Error loading data: ${error.message}`, 'error');
    }
}

// Auto-refresh status every 30 seconds
refreshStatus();
loadBackups();
setInterval(refreshStatus, 30000);
