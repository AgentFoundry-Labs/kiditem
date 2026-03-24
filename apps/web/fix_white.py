import os
import glob
import re

files = glob.glob("src/**/*.tsx", recursive=True)

for file_path in files:
    with open(file_path, 'r') as f:
        content = f.read()
        
    original = content
    
    # Active tab usually had bg-white/10, let's use bg-white
    content = re.sub(r'bg-white/10', 'bg-white', content)
    
    # Hover states
    content = re.sub(r'hover:bg-white/\[0\.0[12]\]', 'hover:bg-gray-50', content)
    content = re.sub(r'hover:bg-white/5', 'hover:bg-gray-50', content)
    
    if content != original:
        with open(file_path, 'w') as f:
            f.write(content)
        print(f"Fixed white transparency in {file_path}")

