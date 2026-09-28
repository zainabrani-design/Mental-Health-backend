fetch('http://localhost:5000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'test@example.com', password: 'password123' })
})
.then(res => res.json())
.then(data => console.log('Response:', data))
.catch(err => console.error('Fetch Error:', err));
