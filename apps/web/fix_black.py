import os
import glob
import re

files = glob.glob("src/**/*.tsx", recursive=True)

for file_path in files:
    with open(file_path, 'r') as f:
        content = f.read()
        
    original = content
    
    # replace dark mode background opacities with light equivalents
    content = re.sub(r'bg-black/20', 'bg-gray-50', content)
    content = re.sub(r'bg-black/30', 'bg-gray-50', content)
    content = re.sub(r'bg-black/40', 'bg-gray-50', content)
    content = re.sub(r'bg-black/50', 'bg-gray-50', content)
    
    if content != original:
        with open(file_path, 'w') as f:
            f.write(content)
        print(f"Fixed black transparency in {file_path}")

