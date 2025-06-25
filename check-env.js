import 'dotenv/config';

console.log('🔍 Checking Environment Variables...\n');

console.log('CLIENT_ID:', process.env.CLIENT_ID ? '✅ Set' : '❌ Missing');
console.log('CLIENT_SECRET:', process.env.CLIENT_SECRET ? '✅ Set' : '❌ Missing');
console.log('REDIRECT_URI:', process.env.REDIRECT_URI ? '✅ Set' : '❌ Missing');
console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '✅ Set' : '❌ Missing');

console.log('\n📋 Next Steps:');
if (!process.env.CLIENT_ID || !process.env.CLIENT_SECRET || !process.env.REDIRECT_URI) {
  console.log('❌ Missing QuickBooks credentials. Please:');
  console.log('   1. Create a .env file with your QuickBooks credentials');
  console.log('   2. Get credentials from: https://developer.intuit.com/');
  console.log('   3. Set CLIENT_ID, CLIENT_SECRET, and REDIRECT_URI');
} else {
  console.log('✅ QuickBooks credentials found!');
  console.log('   Visit: http://localhost:3000/auth/start to authenticate');
} 