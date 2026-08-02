#!/bin/bash

# Get the directory where the script is located
script_dir=$(dirname "$(realpath "$0")")

# Define the backup directory with full path
backup_dir="$script_dir/backup"

# Define the maximum number of directories to keep
max_dirs=14

# Check if the backup directory exists, create it if it doesn't
if [ ! -d "$backup_dir" ]; then
    mkdir "$backup_dir"
fi

# Get the list of directories sorted by creation date (oldest first)
dirs=($(ls -1tr "$backup_dir"))

# Check if there are more than max_dirs directories
dir_count=${#dirs[@]}
if (( dir_count > max_dirs )); then
    # Calculate the number of directories to delete
    delete_count=$((dir_count - max_dirs))
    
    # Loop through the directories to delete the oldest ones
    for ((i=0; i<delete_count; i++)); do
        rm -rf "$backup_dir/${dirs[$i]}"
    done
    
    echo "$delete_count directories deleted."
else
    echo "No directories to delete. Total directories: $dir_count"
fi

# Create a directory inside "backup" with the current date and time
current_date=$(date +"%Y-%m-%d_%H-%M-%S-%3N")
backup_subdir="$backup_dir/$current_date"
mkdir "$backup_subdir"

# Create a consistent SQLite snapshot containing every table except retained
# chatbot conversation content.
bun run "$script_dir/tools/backup_db.ts" "$script_dir/data.db" "$backup_subdir/data.db"

echo "Backup completed successfully in $backup_subdir."
