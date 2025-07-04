#!/bin/bash

# Bot cleanup script - Move old and unused files to DELETED folder
# Created: 2025-07-03

echo "=== Bot.js Cleanup Script ==="
echo "This will move old, duplicate, and unused files to DELETED/ folder."
echo "Please review the list before confirming."
echo ""

# Create DELETED folder if it doesn't exist
mkdir -p DELETED

# Files to remove
FILES_TO_REMOVE=(
    # Old/backup server files
    "server.old.js"
    "server_broken.js"
    
    # Token file copies and backups
    "tokens.30758517 copy.json"
    "tokens.30758517 copy 2.json"
    "tokens.30758517.backup.json"
    "tokens.558612609 copy.json"
    "tokens.558612609 copy 2.json"
    "tokens.558612609.backup.json"
    "tokensCopy.json"
    
    # Temporary files
    "claudePickUp.txt"
    
    # Completed migration scripts
    "migrate-eggs-to-postgres.js"
    "migrate-eggs-schema.js"
    "migrateFromUsersJson.js"
    "migrateStreamElementsToEggs.js"
    "setup-egg-database.js"
    "simple-setup-eggs.js"
    "setup-postgres-eggs.sh"
    "import.js"
    "import-quotes.js"
    
    # Duplicate/old service files
    "eggServiceNew.js"
    "colours"
    "colours.js"
    "colours2.js"
    
    # Test/example files
    "streamElementsExample.js"
    "test-custom-commands.js"
    "test-subs.js"
    "config-example.json"
    
    # Old scripts that have been moved  
    "debugUser.js"
    "backupEggs.js"
    "check-eggs-table.js"
    "linkSupabaseUser.js"
    "addModerator.js"
)

echo "Files to be moved to DELETED/:"
echo "=============================="
for file in "${FILES_TO_REMOVE[@]}"; do
    if [ -f "$file" ]; then
        echo "  ✓ $file"
    else
        echo "  ✗ $file (not found)"
    fi
done

echo ""
echo "Total files to move: ${#FILES_TO_REMOVE[@]}"
echo ""
read -p "Do you want to proceed with moving files to DELETED/? (y/N): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Moving files to DELETED/..."
    for file in "${FILES_TO_REMOVE[@]}"; do
        if [ -f "$file" ]; then
            mv "$file" "DELETED/"
            echo "  Moved: $file → DELETED/"
        fi
    done
    echo "Cleanup complete!"
    echo ""
    echo "Files have been moved to DELETED/ folder."
    echo "Test your application, then run 'rm -rf DELETED/' if everything works."
else
    echo "Cleanup cancelled."
fi

echo ""
echo "=== Recommended .gitignore additions ==="
echo "Add these to your .gitignore file:"
echo ""
echo "# Token files"
echo "tokens.*.json"
echo "tokens.json"
echo "tokens_me.json"
echo ""
echo "# Config files with sensitive data"
echo "config.json"
echo "secret.json"
echo ""
echo "# Data files"
echo "users.json"
echo "modList.json"
echo ""
echo "# Logs"
echo "*.log"
echo ""
echo "# Backups"
echo "*.backup.*"
echo "*.old"
echo "*copy*"
echo ""
echo "# Cleanup folder"
echo "DELETED/"