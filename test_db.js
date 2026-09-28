require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const mongoose = require('mongoose');

console.log('Connecting to', process.env.MONGODB_URI ? 'URI found' : 'URI missing');
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('Connected successfully!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Connection error:', err);
    process.exit(1);
  });
