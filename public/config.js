// Frontend configuration
// Update these values with your actual Supabase configuration

window.CONFIG = {
    // Replace these with your actual Supabase values
    SUPABASE_URL: 'YOUR_SUPABASE_PROJECT_URL',
    SUPABASE_ANON_KEY: 'YOUR_SUPABASE_ANON_KEY',
    
    // API endpoint (should match your server)
    API_BASE_URL: window.location.origin + '/api',
    
    // Redirect URL for Twitch OAuth
    REDIRECT_URL: window.location.origin + '/dashboard'
}

// Instructions for setup:
// 1. Go to your Supabase project dashboard
// 2. Go to Settings > API
// 3. Copy your Project URL and paste it as SUPABASE_URL
// 4. Copy your anon public key and paste it as SUPABASE_ANON_KEY
// 5. Make sure your Twitch OAuth redirect URL in Supabase includes: https://yourdomain.com/dashboard