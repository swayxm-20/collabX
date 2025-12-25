#!/bin/bash
# Bash script to set up backend environment (for Linux/Mac)
# Run this script: bash setup.sh

# Create virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

echo "Backend setup complete! To activate the virtual environment, run: source venv/bin/activate"

