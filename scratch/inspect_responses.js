const url = 'https://fnwkyvjtvbrqgsitimey.supabase.co/rest/v1/responses?survey_id=eq.d9acb0a4-7aa7-4169-8b65-24b56f9283c1&select=id,session_token,ip_hash,started_at,completed_at,is_complete';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZud2t5dmp0dmJycWdzaXRpbWV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMTE3OTQsImV4cCI6MjA5MDg4Nzc5NH0.ms5zRgNTY-5vLEes7J1COKp4aUNRc2KkXwCfdJAa8_Y';

async function run() {
  try {
    const res = await fetch(url, {
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`
      }
    });
    const data = await res.json();
    console.log(`Total responses found in database: ${data.length}`);
    console.log('Sample of responses (last 10):');
    console.log(JSON.stringify(data.slice(-10), null, 2));
  } catch (err) {
    console.error(err);
  }
}

run();
