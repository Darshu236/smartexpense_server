// route-checker.js - Quick script to identify problematic route patterns
import { pathToRegexp } from 'path-to-regexp';

const routesToTest = [
  // Friend routes
  '/api/friends',
  '/api/friends/test',
  '/api/friends/public/test',
  '/api/friends/add',
  '/api/friends/search',
  '/api/friends/:friendId',
  
  // Split expense routes
  '/api/split-expenses',
  '/api/split-expenses/test',
  '/api/split-expenses/:id',
  
  // Debt routes
  '/api/debts/owed-to-me',
  '/api/debts/owed-by-me',
  '/api/debts/summary',
  '/api/debts/manual',
  '/api/debts/:id',
  '/api/debts/:id/mark-paid',
  '/api/debts/:id/send-reminder',
  '/api/debts/:id/dispute',
  
  // Auth routes
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/me',
  '/api/auth/profile',
  '/api/auth/test',
  
  // Settings routes
  '/api/settings',
  '/api/settings/debug',
  '/api/settings/test',
  
  // User routes
  '/api/users/me',
  '/api/users/:userId',
  
  // Other common patterns
  '/api/transactions',
  '/api/transactions/:id',
  '/api/budgets',
  '/api/budgets/:id',
  '/api/notifications',
  '/api/notifications/:notificationId',
];

console.log('🔍 Testing route patterns for path-to-regexp compatibility...\n');

let hasErrors = false;

routesToTest.forEach((route, index) => {
  try {
    const regex = pathToRegexp(route);
    console.log(`✅ ${index + 1}. ${route} - OK`);
  } catch (error) {
    console.error(`❌ ${index + 1}. ${route} - ERROR: ${error.message}`);
    hasErrors = true;
  }
});

if (hasErrors) {
  console.log('\n❌ Some routes have issues that need fixing!');
  console.log('\nCommon issues:');
  console.log('- Invalid parameter names (must start with letter/underscore)');
  console.log('- Missing parameter names in patterns like /:');
  console.log('- Invalid characters in route patterns');
  console.log('- Malformed wildcard patterns');
} else {
  console.log('\n✅ All route patterns are valid!');
}

// Additional checks for common problematic patterns
const problematicPatterns = [
  '*',           // Wildcard without proper syntax
  '/*',          // Basic wildcard
  '/**',         // Nested wildcard
  '/:',          // Missing parameter name
  '/:/test',     // Invalid parameter format
  '/{test}',     // Wrong parameter syntax
  '/api/*path',  // Partial wildcard
];

console.log('\n🔍 Testing known problematic patterns...\n');

problematicPatterns.forEach((pattern, index) => {
  try {
    const regex = pathToRegexp(pattern);
    console.log(`⚠️  ${index + 1}. "${pattern}" - Surprisingly OK`);
  } catch (error) {
    console.log(`❌ ${index + 1}. "${pattern}" - Expected error: ${error.message}`);
  }
});

console.log('\n📝 Recommendations:');
console.log('1. Avoid using wildcard routes with "*" - use specific 404 handlers instead');
console.log('2. Ensure all parameters have valid names: /:id not /:');
console.log('3. Use router.use((req, res) => {...}) for catch-all routes instead of router.use("*")');
console.log('4. Order routes from most specific to least specific');
console.log('5. Place parameterized routes after static routes');

export default { routesToTest, problematicPatterns };