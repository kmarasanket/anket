const url = 'https://fnwkyvjtvbrqgsitimey.supabase.co/rest/v1/rpc/get_tenant_survey_status';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZud2t5dmp0dmJycWdzaXRpbWV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzMTE3OTQsImV4cCI6MjA5MDg4Nzc5NH0.ms5zRgNTY-5vLEes7J1COKp4aUNRc2KkXwCfdJAa8_Y';

async function run() {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ p_tenant_id: '76f68b8b-e65c-4f8b-8d3f-5ac5979ecbf0' })
    });
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(err);
  }
}

run();
