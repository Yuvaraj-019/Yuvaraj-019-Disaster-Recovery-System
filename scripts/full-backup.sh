#!/bin/bash

# Configuration
BACKUP_DIR="/home/ubuntu/backup-temp"
S3_BUCKET="disaster-recovery-backups-project"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="mongodb_full_backup_$TIMESTAMP"

echo "=== Starting MongoDB Backup ==="
echo "Timestamp: $TIMESTAMP"
echo "Backup name: $BACKUP_NAME"

# Create backup directory
echo "Step 1: Creating backup directory..."
mkdir -p $BACKUP_DIR/$BACKUP_NAME

# Perform MongoDB dump
echo "Step 2: Creating MongoDB dump..."
mongodump --host=localhost --port=27017 --out=$BACKUP_DIR/$BACKUP_NAME

if [ $? -eq 0 ]; then
    echo "✓ MongoDB dump completed successfully"
else
    echo "✗ MongoDB dump failed!"
    exit 1
fi

# Create compressed archive
echo "Step 3: Creating compressed archive..."
cd $BACKUP_DIR
tar -czf $BACKUP_NAME.tar.gz $BACKUP_NAME

if [ $? -eq 0 ]; then
    echo "✓ Archive created successfully"
else
    echo "✗ Archive creation failed!"
    exit 1
fi

# Upload to S3
echo "Step 4: Uploading to S3..."
aws s3 cp $BACKUP_NAME.tar.gz s3://$S3_BUCKET/mongodb-backups/

if [ $? -eq 0 ]; then
    echo "✓ Backup uploaded to S3 successfully"
else
    echo "✗ S3 upload failed!"
    exit 1
fi

# Cleanup local files
echo "Step 5: Cleaning up local files..."
rm -rf $BACKUP_DIR/$BACKUP_NAME
rm -f $BACKUP_DIR/$BACKUP_NAME.tar.gz

echo "=== Backup Completed Successfully ==="
echo "Backup: $BACKUP_NAME.tar.gz"
echo "S3 Location: s3://$S3_BUCKET/mongodb-backups/$BACKUP_NAME.tar.gz"
echo "Size: $(du -h $BACKUP_DIR/$BACKUP_NAME.tar.gz 2>/dev/null | cut -f1 || echo 'unknown')"
