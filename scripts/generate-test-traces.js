const axios = require('axios');

const BASE_URL = 'http://localhost:3001/api';
const UPLOAD_URL = 'http://localhost:3005/api';

const scenarios = [
  {
    name: 'Create Order',
    method: 'POST',
    url: `${BASE_URL}/orders`,
    data: () => ({
      productId: `prod-${Math.floor(Math.random() * 100)}`,
      quantity: Math.floor(Math.random() * 5) + 1,
      userId: `user-${Math.floor(Math.random() * 10) + 1}`,
    }),
    weight: 3,
  },
  {
    name: 'Get Orders',
    method: 'GET',
    url: `${BASE_URL}/orders`,
    weight: 2,
  },
  {
    name: 'Get Order by ID',
    method: 'GET',
    url: () =>
      `${BASE_URL}/orders/${Math.random() > 0.8 ? 'nonexistent' : 'order-1'}`,
    weight: 2,
  },
  {
    name: 'Upload File',
    method: 'POST',
    url: `${UPLOAD_URL}/files/upload`,
    data: () => {
      const FormData = require('form-data');
      const form = new FormData();
      form.append('file', Buffer.from('test file content'), 'test.txt');
      form.append('userId', `user-${Math.floor(Math.random() * 10) + 1}`);
      form.append('category', 'test');
      return form;
    },
    weight: 1,
  },
];

async function makeRequest(scenario) {
  try {
    const url =
      typeof scenario.url === 'function' ? scenario.url() : scenario.url;
    const data = scenario.data ? scenario.data() : undefined;

    const config = {
      method: scenario.method,
      url,
      timeout: 5000,
    };

    if (data) {
      if (data.getHeaders) {
        // FormData
        config.data = data;
        config.headers = data.getHeaders();
      } else {
        // JSON
        config.data = data;
        config.headers = { 'Content-Type': 'application/json' };
      }
    }

    const response = await axios(config);
    return { success: true, status: response.status, data: response.data };
  } catch (error) {
    return {
      success: false,
      status: error.response?.status || 'ERROR',
      error: error.message,
    };
  }
}

async function runScenario() {
  const weightedScenarios = [];
  scenarios.forEach((scenario) => {
    for (let i = 0; i < scenario.weight; i++) {
      weightedScenarios.push(scenario);
    }
  });

  const scenario =
    weightedScenarios[Math.floor(Math.random() * weightedScenarios.length)];
  const startTime = Date.now();
  const result = await makeRequest(scenario);
  const duration = Date.now() - startTime;

  const status = result.success ? '✅' : '❌';
  const timestamp = new Date().toLocaleTimeString();

  console.log(
    `${status} [${timestamp}] ${scenario.name} → ${result.status} (${duration}ms)`
  );

  if (!result.success || scenario.name === 'Create Order') {
    console.log(
      `   Response: ${JSON.stringify(result.data || result.error, null, 0)}`
    );
  }

  return result;
}

async function main() {
  console.log('🚀 Generating test traces for Kafka Microservices');
  console.log('📊 This will create traces in SigNoz at http://localhost:3301');
  console.log('🔄 Generating requests... (Press Ctrl+C to stop)');
  console.log('');

  let totalRequests = 0;
  let successfulRequests = 0;

  const interval = setInterval(async () => {
    const result = await runScenario();
    totalRequests++;
    if (result.success) successfulRequests++;

    if (totalRequests % 20 === 0) {
      const successRate = Math.round(
        (successfulRequests / totalRequests) * 100
      );
      console.log('');
      console.log(
        `📊 Stats: ${totalRequests} requests, ${successRate}% success rate`
      );
      console.log('');
    }
  }, 2000);

  process.on('SIGINT', () => {
    clearInterval(interval);
    const successRate =
      totalRequests > 0
        ? Math.round((successfulRequests / totalRequests) * 100)
        : 0;
    console.log('\n');
    console.log('📊 Final Stats:');
    console.log(`   Total Requests: ${totalRequests}`);
    console.log(`   Successful: ${successfulRequests}`);
    console.log(`   Success Rate: ${successRate}%`);
    console.log('');
    console.log('✅ Trace generation completed!');
    console.log('🔍 Check SigNoz Dashboard: http://localhost:3301');
    process.exit(0);
  });
}

if (require.main === module) {
  main().catch(console.error);
}
