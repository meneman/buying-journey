const fs = require('fs');

let css = fs.readFileSync('src/web/frontend/style.css', 'utf8');

// Replace Root Variables
css = css.replace(/:root\s*\{[^}]+\}/, `:root {
    /* Light Minimal Palette */
    --bg-primary: #ffffff;
    --bg-secondary: #f8f9fa;
    --bg-tertiary: #f1f3f4;
    --card-bg: transparent;
    --border-color: #dadce0;
    
    --text-primary: #202124;
    --text-secondary: #5f6368;
    --text-muted: #80868b;
    
    /* Accents (Material) */
    --accent-blue: #1a73e8;
    --accent-cyan: #12b5cb;
    --accent-emerald: #1e8e3e;
    --accent-violet: #9334e6;
    --accent-orange: #f29900;
    --accent-red: #d93025;
    
    /* UI Values */
    --glass-blur: none;
    --radius-lg: 0;
    --radius-md: 0;
    --radius-sm: 0;
    --shadow-premium: none;
    --transition-smooth: none;
    --transition-micro: none;
}`);

// Remove blobs
css = css.replace(/\.glass-bg-blobs\s*\{[^}]+\}/, `.glass-bg-blobs { display: none; }`);
css = css.replace(/\.blob-[0-9]\s*\{[^}]+\}/g, '');

// Backgrounds and colors
css = css.replace(/background-color:\s*rgba\([^)]+\)/g, (match) => {
    if (match.includes('255, 255, 255')) return 'background-color: rgba(0,0,0,0.04)';
    if (match.includes('9, 13, 22')) return 'background-color: transparent';
    if (match.includes('0, 0, 0')) return 'background-color: rgba(0,0,0,0.02)';
    return match;
});

// Remove shadows
css = css.replace(/box-shadow:[^;]+;/g, 'box-shadow: none;');

// Remove gradients and make text solid
css = css.replace(/background:\s*linear-gradient[^;]+;/g, 'background: var(--bg-secondary);');
css = css.replace(/-webkit-background-clip:[^;]+;/g, '');
css = css.replace(/-webkit-text-fill-color:[^;]+;/g, '');

// Specifically fix brand color
css = css.replace(/\.brand h1\s*\{[^}]+\}/, `.brand h1 {
    font-size: 1.5rem;
    font-weight: 500;
    color: var(--text-primary);
}`);

// Buttons
css = css.replace(/\.btn-primary\s*\{[^}]+\}/, `.btn-primary {
    background: var(--accent-blue);
    color: #ffffff;
    border: none;
}`);

// Border colors
css = css.replace(/border-color:\s*rgba\(255,\s*255,\s*255,\s*0\.[0-9]+\);/g, 'border-color: var(--border-color);');
css = css.replace(/border:\s*1px\s+solid\s+var\(--glass-border\);/g, 'border: none;');

// Panels and cards
css = css.replace(/\.card\s*\{[^}]+\}/, `.card {
    background-color: var(--bg-primary);
    border: none;
    border-radius: 0;
    box-shadow: none;
}`);

css = css.replace(/\.product-card\s*\{[^}]+\}/, `.product-card {
    display: flex;
    flex-direction: column;
    height: 320px;
    border: none;
    border-bottom: 1px solid var(--border-color);
    background-color: var(--bg-primary);
}`);

css = css.replace(/\.product-card:hover\s*\{[^}]+\}/, `.product-card:hover {
    background-color: var(--bg-secondary);
}`);

css = css.replace(/\.product-title\s*\{[^}]+\}/, `.product-title {
    font-size: 1.15rem;
    font-weight: 500;
    color: var(--text-primary);
    margin-bottom: 0.25rem;
}`);

css = css.replace(/color:\s*#fff;/g, 'color: var(--text-primary);');

// Spec card
css = css.replace(/\.spec-card\s*\{[^}]+\}/, `.spec-card {
    background-color: var(--bg-primary);
    border: none;
    border-bottom: 1px solid var(--border-color);
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 1rem;
}`);
css = css.replace(/\.spec-card::before\s*\{[^}]+\}/, `.spec-card::before { display: none; }`);
css = css.replace(/\.spec-card:hover\s*\{[^}]+\}/, `.spec-card:hover { background-color: var(--bg-secondary); }`);

// Timeline
css = css.replace(/\.timeline-content\s*\{[^}]+\}/, `.timeline-content {
    font-size: 0.85rem;
    color: var(--text-secondary);
    padding: 0.5rem 0;
}`);

// Inputs
css = css.replace(/\.form-control\s*\{[^}]+\}/, `.form-control {
    width: 100%;
    background-color: transparent;
    border: none;
    border-bottom: 1px solid var(--border-color);
    border-radius: 0;
    color: var(--text-primary);
    padding: 0.65rem 0;
    font-family: inherit;
    font-size: 0.9rem;
}`);
css = css.replace(/\.form-control:focus\s*\{[^}]+\}/, `.form-control:focus {
    outline: none;
    border-bottom: 2px solid var(--accent-blue);
}`);

// Feedback card
css = css.replace(/\.feedback-card\s*\{[^}]+\}/, `.feedback-card {
    display: flex;
    flex-direction: column;
    height: fit-content;
    min-height: 350px;
    border: none;
    border-bottom: 1px solid var(--border-color);
}`);

fs.writeFileSync('src/web/frontend/style.css', css);
console.log("Refactored CSS written.");
