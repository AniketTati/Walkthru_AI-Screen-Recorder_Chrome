#!/bin/bash

# Script to generate PNG icons from SVG
# Requires: rsvg-convert (from librsvg) or Inkscape or ImageMagick with RSVG

SVG_FILE="icon.svg"
SIZES=(16 48 128)

# Check if SVG file exists
if [ ! -f "$SVG_FILE" ]; then
    echo "Error: $SVG_FILE not found!"
    exit 1
fi

# Try different conversion tools
convert_svg() {
    local size=$1
    local output="icon${size}.png"
    
    # Try rsvg-convert first (best quality)
    if command -v rsvg-convert &> /dev/null; then
        echo "Using rsvg-convert for ${size}x${size}..."
        rsvg-convert -w "$size" -h "$size" "$SVG_FILE" -o "$output"
        return $?
    fi
    
    # Try Inkscape
    if command -v inkscape &> /dev/null; then
        echo "Using Inkscape for ${size}x${size}..."
        inkscape "$SVG_FILE" --export-filename="$output" -w "$size" -h "$size" 2>/dev/null
        return $?
    fi
    
    # Try ImageMagick convert
    if command -v convert &> /dev/null; then
        echo "Using ImageMagick for ${size}x${size}..."
        convert -background none -density 300 "$SVG_FILE" -resize "${size}x${size}" "$output"
        return $?
    fi
    
    # Try sips (macOS built-in, but limited SVG support)
    if command -v sips &> /dev/null && command -v qlmanage &> /dev/null; then
        echo "Using macOS tools for ${size}x${size}..."
        # First convert SVG to PNG using qlmanage, then resize with sips
        qlmanage -t -s 512 -o /tmp "$SVG_FILE" 2>/dev/null
        local tmp_file="/tmp/${SVG_FILE}.png"
        if [ -f "$tmp_file" ]; then
            sips -z "$size" "$size" "$tmp_file" --out "$output" 2>/dev/null
            rm "$tmp_file"
            return $?
        fi
    fi
    
    echo "Error: No suitable SVG converter found!"
    echo "Please install one of the following:"
    echo "  - librsvg: brew install librsvg"
    echo "  - Inkscape: brew install inkscape"
    echo "  - ImageMagick: brew install imagemagick"
    return 1
}

echo "Generating icons from $SVG_FILE..."
echo ""

success_count=0
for size in "${SIZES[@]}"; do
    if convert_svg "$size"; then
        echo "✓ Created icon${size}.png"
        ((success_count++))
    else
        echo "✗ Failed to create icon${size}.png"
    fi
done

echo ""
echo "Generated $success_count of ${#SIZES[@]} icons."

if [ $success_count -eq ${#SIZES[@]} ]; then
    echo "All icons generated successfully!"
    exit 0
else
    exit 1
fi
