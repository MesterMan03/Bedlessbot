#!/bin/bash

# Create a new directory called "backup" if it doesn't exist
backup_dir="backup"
if [ ! -d "$backup_dir" ]; then
    mkdir "$backup_dir"
fi

# Create a directory inside "backup" with the current date and time
current_date=$(date +"%Y-%m-%d_%H-%M-%S")
backup_subdir="$backup_dir/$current_date"
mkdir "$backup_subdir"

# Copy files matching "data.db*" into the newly created directory
cp data.db* "$backup_subdir"

echo "Backup completed successfully in $backup_subdir."