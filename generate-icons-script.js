function drawIcon(canvas, size) {
  const ctx = canvas.getContext('2d');
  
  // Background
  ctx.fillStyle = '#007aff';
  ctx.fillRect(0, 0, size, size);
  
  // Recording circle
  const centerX = size / 2;
  const centerY = size / 2;
  const radius = size * 0.3;
  
  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
  ctx.fill();
  
  // Inner dot
  ctx.fillStyle = '#ff3b30';
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius * 0.5, 0, 2 * Math.PI);
  ctx.fill();
}

function generateIcons() {
  const sizes = [
    { id: 'icon16', size: 16, filename: 'icon16.png' },
    { id: 'icon48', size: 48, filename: 'icon48.png' },
    { id: 'icon128', size: 128, filename: 'icon128.png' }
  ];

  let downloadCount = 0;
  
  sizes.forEach(({ id, size, filename }, index) => {
    const canvas = document.getElementById(id);
    drawIcon(canvas, size);
    
    // Download with delay to prevent browser blocking multiple downloads
    setTimeout(() => {
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        setTimeout(() => {
          URL.revokeObjectURL(url);
          downloadCount++;
          
          if (downloadCount === sizes.length) {
            alert('All 3 icons generated and downloaded!\n\nFiles:\n- icon16.png\n- icon48.png\n- icon128.png\n\nThey are ready to use in your extension.');
          }
        }, 100);
      }, 'image/png');
    }, index * 200);
  });
}

// Draw icons on page load
window.onload = () => {
  drawIcon(document.getElementById('icon16'), 16);
  drawIcon(document.getElementById('icon48'), 48);
  drawIcon(document.getElementById('icon128'), 128);
  
  // Attach click event to button
  document.querySelector('button').addEventListener('click', generateIcons);
};
