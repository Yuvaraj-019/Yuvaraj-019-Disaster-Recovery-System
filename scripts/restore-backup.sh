#!/bin/bash

# Check if backup file is provided
if [ $# -eq 0 ]; then
    echo "Usage: $0 <backup_filename_from_s3>"
    echo "Example: $0 mongodb_full_backup_20251115_020001.tar.gz"
    echo ""
    echo "Available backups in S3:"
    aws s3 ls s3://disaster-recovery-backups-project/mongodb-backups/
    exit 1
fi

BACKUP_FILE=$1
S3_BUCKET="disaster-recovery-backups-project"
RESTORE_DIR="/home/ubuntu/restore-temp"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "=== Starting Disaster Recovery Restore ==="
echo "Backup file: $BACKUP_FILE"
echo "Time: $(date)"

# Create restore directory
echo "Step 1: Creating restore directory..."
mkdir -p $RESTORE_DIR

# Download backup from S3
echo "Step 2: Downloading backup from S3..."
aws s3 cp s3://$S3_BUCKET/mongodb-backups/$BACKUP_FILE $RESTORE_DIR/

if [ $? -ne 0 ]; then
    echo "✗ Failed to download backup from S3"
    exit 1
fi
echo "✓ Backup downloaded successfully"

# Extract backup
echo "Step 3: Extracting backup..."
cd $RESTORE_DIR
tar -xzf $BACKUP_FILE

if [ $? -ne 0 ]; then
    echo "✗ Failed to extract backup"
    exit 1
fi
echo "✓ Backup extracted successfully"

# Find the backup directory
BACKUP_DIR_NAME=$(find . -type d -name "mongodb_full_backup_*" | head -1 | cut -d'/' -f2)
echo "Backup directory: $BACKUP_DIR_NAME"

# Restore to MongoDB
echo "Step 4: Restoring to MongoDB..."
mongorestore --host=localhost --port=27017 --drop $RESTORE_DIR/$BACKUP_DIR_NAME

if [ $? -eq 0 ]; then
    echo "✓ MongoDB restore completed successfully"
else
    echo "✗ MongoDB restore failed!"
    exit 1
fi

# Verify restoration
echo "Step 5: Verifying restore..."
CRITICAL_COUNT=$(mongosh --eval "db.getSiblingDB('disasterRecoveryDB').criticalData.countDocuments()" --quiet 2>/dev/null || echo "0")
USERS_COUNT=$(mongosh --eval "db.getSiblingDB('disasterRecoveryDB').users.countDocuments()" --quiet 2>/dev/null || echo "0")

echo "Restored data counts:"
echo "  - Critical Data: $CRITICAL_COUNT records"
echo "  - Users: $USERS_COUNT records"

# Cleanup
echo "Step 6: Cleaning up restore directory..."
rm -rf $RESTORE_DIR

echo "=== Disaster Recovery Restore Completed Successfully ==="
echo "✓ Data restored from: $BACKUP_FILE"
echo "✓ Database is now running with restored data"
