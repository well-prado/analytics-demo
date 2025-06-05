#!/usr/bin/env node

/**
 * System Verification Script
 * Tests the entire Dynamic Company Analytics system
 */

const http = require('http');

const BASE_URL = 'http://localhost:4000';
const ENDPOINT = '/company-analytics';

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Helper function to make HTTP requests
function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 4000,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: responseData });
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

// Test functions
async function testApiInfo() {
  log('\n🔍 Testing API Information Endpoint...', 'blue');
  try {
    const response = await makeRequest('GET', ENDPOINT);
    
    if (response.status === 200 && response.data.service) {
      log('✅ API Info endpoint working', 'green');
      log(`   Service: ${response.data.service}`);
      log(`   Endpoints: ${Object.keys(response.data.endpoints).length} available`);
      return true;
    } else {
      log('❌ API Info endpoint failed', 'red');
      return false;
    }
  } catch (error) {
    log(`❌ API Info test failed: ${error.message}`, 'red');
    return false;
  }
}

async function testSchemaDiscovery() {
  log('\n🔍 Testing Schema Discovery...', 'blue');
  try {
    const response = await makeRequest('GET', `${ENDPOINT}/schema`);
    
    if (response.status === 200 && response.data.schema) {
      log('✅ Schema discovery working', 'green');
      log(`   Tables discovered: ${response.data.total_tables}`);
      log(`   Departments: ${response.data.available_departments?.length || 0}`);
      return true;
    } else {
      log('❌ Schema discovery failed', 'red');
      return false;
    }
  } catch (error) {
    log(`❌ Schema discovery test failed: ${error.message}`, 'red');
    return false;
  }
}

async function testQueryExecution() {
  log('\n🔍 Testing Natural Language Queries...', 'blue');
  
  const testQueries = [
    {
      name: 'Simple Sales Query',
      query: { query: 'Show me sales metrics' }
    },
    {
      name: 'Department Comparison',
      query: { query: 'What are our top performing departments?' }
    },
    {
      name: 'Time-based Query',
      query: { query: 'Show me Q4 metrics' }
    },
    {
      name: 'HR Specific Query',
      query: { query: 'Employee satisfaction metrics' }
    }
  ];

  let passedTests = 0;
  
  for (const test of testQueries) {
    try {
      const response = await makeRequest('POST', `${ENDPOINT}/query`, test.query);
      
      if (response.status === 200 && response.data.results) {
        log(`✅ ${test.name}: ${response.data.total_results} results`, 'green');
        if (response.data.matched_patterns) {
          log(`   Patterns: ${response.data.matched_patterns.join(', ')}`);
        }
        passedTests++;
      } else {
        log(`❌ ${test.name}: Failed`, 'red');
        console.log('Response:', response.data);
      }
    } catch (error) {
      log(`❌ ${test.name}: Error - ${error.message}`, 'red');
    }
  }
  
  return passedTests === testQueries.length;
}

async function testErrorHandling() {
  log('\n🔍 Testing Error Handling...', 'blue');
  try {
    const response = await makeRequest('DELETE', `${ENDPOINT}/invalid`);
    
    if (response.data && response.data.error && response.data.error.includes('Method not allowed')) {
      log('✅ Error handling working (Method not allowed)', 'green');
      return true;
    } else {
      log('❌ Error handling failed', 'red');
      log(`   Status: ${response.status}, Response: ${JSON.stringify(response.data)}`);
      return false;
    }
  } catch (error) {
    log(`❌ Error handling test failed: ${error.message}`, 'red');
    return false;
  }
}

// Main test runner
async function runTests() {
  log('🚀 Starting Dynamic Company Analytics System Tests', 'yellow');
  log('=' .repeat(60), 'yellow');
  
  const tests = [
    { name: 'API Information', fn: testApiInfo },
    { name: 'Schema Discovery', fn: testSchemaDiscovery },
    { name: 'Query Execution', fn: testQueryExecution },
    { name: 'Error Handling', fn: testErrorHandling }
  ];
  
  let passedTests = 0;
  
  for (const test of tests) {
    const result = await test.fn();
    if (result) passedTests++;
  }
  
  log('\n' + '=' .repeat(60), 'yellow');
  log(`📊 Test Results: ${passedTests}/${tests.length} tests passed`, 'yellow');
  
  if (passedTests === tests.length) {
    log('🎉 All tests passed! System is working correctly.', 'green');
    log('\n🔗 Your system is ready for:');
    log('   • Claude Desktop MCP integration', 'blue');
    log('   • Production deployment', 'blue');
    log('   • Tutorial recording', 'blue');
  } else {
    log('⚠️  Some tests failed. Please check the issues above.', 'red');
    log('\n🔧 Troubleshooting steps:');
    log('   1. Ensure PostgreSQL is running', 'yellow');
    log('   2. Verify .env file is configured', 'yellow');
    log('   3. Run: npm run seed', 'yellow');
    log('   4. Check server is running on port 4000', 'yellow');
  }
  
  process.exit(passedTests === tests.length ? 0 : 1);
}

// Check if server is running first
async function checkServer() {
  try {
    await makeRequest('GET', '/');
    return true;
  } catch (error) {
    log('❌ Server is not running on localhost:4000', 'red');
    log('   Please start the server with: npm start', 'yellow');
    return false;
  }
}

// Run the tests
(async () => {
  const serverRunning = await checkServer();
  if (serverRunning) {
    await runTests();
  } else {
    process.exit(1);
  }
})(); 