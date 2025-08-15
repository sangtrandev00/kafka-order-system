const axios = require('axios');
const { performance } = require('perf_hooks');

class LoadTester {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || 'http://localhost:3001/api';
    this.uploadUrl = options.uploadUrl || 'http://localhost:3005/api';
    this.concurrency = options.concurrency || 10;
    this.duration = options.duration || 60000; // 1 minute
    this.rampUp = options.rampUp || 10000; // 10 seconds

    this.stats = {
      requests: 0,
      successful: 0,
      failed: 0,
      totalResponseTime: 0,
      errors: {},
      responseTimeDistribution: [],
      startTime: Date.now(),
    };

    this.scenarios = [
      {
        name: 'Create Order',
        method: 'POST',
        url: '/orders',
        weight: 3,
        data: this.generateOrderData,
      },
      { name: 'Get Orders', method: 'GET', url: '/orders', weight: 2 },
      {
        name: 'Get Order by ID',
        method: 'GET',
        url: '/orders/test-order',
        weight: 2,
      },
      {
        name: 'Upload File',
        method: 'POST',
        url: '/files/upload',
        weight: 1,
        data: this.generateFileData,
        baseUrl: this.uploadUrl,
      },
    ];
  }

  generateOrderData() {
    return {
      productId: `prod-${Math.floor(Math.random() * 100)}`,
      quantity: Math.floor(Math.random() * 10) + 1,
      userId: `user-${Math.floor(Math.random() * 50) + 1}`,
    };
  }

  generateFileData() {
    const FormData = require('form-data');
    const form = new FormData();
    const fileSize = Math.floor(Math.random() * 1024) + 100;
    form.append(
      'file',
      Buffer.alloc(fileSize, 'test'),
      `test-${Date.now()}.txt`
    );
    form.append('userId', `user-${Math.floor(Math.random() * 50) + 1}`);
    form.append('category', 'load-test');
    return form;
  }

  async executeRequest(scenario) {
    const startTime = performance.now();
    const baseUrl = scenario.baseUrl || this.baseUrl;
    const url = `${baseUrl}${scenario.url}`;

    try {
      const config = {
        method: scenario.method,
        url,
        timeout: 10000,
      };

      if (scenario.data) {
        const data = scenario.data();
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
      const responseTime = performance.now() - startTime;

      this.recordSuccess(responseTime, scenario.name);
      return { success: true, responseTime, status: response.status };
    } catch (error) {
      const responseTime = performance.now() - startTime;
      this.recordFailure(responseTime, error, scenario.name);
      return { success: false, responseTime, error: error.message };
    }
  }

  recordSuccess(responseTime, scenarioName) {
    this.stats.requests++;
    this.stats.successful++;
    this.stats.totalResponseTime += responseTime;
    this.stats.responseTimeDistribution.push(responseTime);
  }

  recordFailure(responseTime, error, scenarioName) {
    this.stats.requests++;
    this.stats.failed++;
    this.stats.totalResponseTime += responseTime;

    const errorType = error.code || error.response?.status || 'Unknown';
    this.stats.errors[errorType] = (this.stats.errors[errorType] || 0) + 1;
  }

  getRandomScenario() {
    const weightedScenarios = [];
    this.scenarios.forEach((scenario) => {
      for (let i = 0; i < scenario.weight; i++) {
        weightedScenarios.push(scenario);
      }
    });
    return weightedScenarios[
      Math.floor(Math.random() * weightedScenarios.length)
    ];
  }

  async worker() {
    while (Date.now() - this.stats.startTime < this.duration) {
      const scenario = this.getRandomScenario();
      await this.executeRequest(scenario);

      // Small delay to prevent overwhelming
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 100));
    }
  }

  calculatePercentile(arr, percentile) {
    const sorted = arr.slice().sort((a, b) => a - b);
    const index = Math.floor((percentile / 100) * sorted.length);
    return sorted[index] || 0;
  }

  printStats() {
    const runtime = Date.now() - this.stats.startTime;
    const rps = Math.round((this.stats.requests / runtime) * 1000);
    const avgResponseTime = this.stats.totalResponseTime / this.stats.requests;
    const successRate = Math.round(
      (this.stats.successful / this.stats.requests) * 100
    );

    console.log('\n📊 Load Test Results:');
    console.log('=====================');
    console.log(`Runtime: ${Math.round(runtime / 1000)}s`);
    console.log(`Total Requests: ${this.stats.requests}`);
    console.log(`Successful: ${this.stats.successful}`);
    console.log(`Failed: ${this.stats.failed}`);
    console.log(`Success Rate: ${successRate}%`);
    console.log(`Requests/sec: ${rps}`);
    console.log(`Avg Response Time: ${avgResponseTime.toFixed(2)}ms`);

    if (this.stats.responseTimeDistribution.length > 0) {
      console.log('\n📈 Response Time Percentiles:');
      console.log(
        `50th: ${this.calculatePercentile(
          this.stats.responseTimeDistribution,
          50
        ).toFixed(2)}ms`
      );
      console.log(
        `90th: ${this.calculatePercentile(
          this.stats.responseTimeDistribution,
          90
        ).toFixed(2)}ms`
      );
      console.log(
        `95th: ${this.calculatePercentile(
          this.stats.responseTimeDistribution,
          95
        ).toFixed(2)}ms`
      );
      console.log(
        `99th: ${this.calculatePercentile(
          this.stats.responseTimeDistribution,
          99
        ).toFixed(2)}ms`
      );
    }

    if (Object.keys(this.stats.errors).length > 0) {
      console.log('\n❌ Error Breakdown:');
      Object.entries(this.stats.errors).forEach(([error, count]) => {
        console.log(`   ${error}: ${count}`);
      });
    }
  }

  async run() {
    console.log('🚀 Starting Load Test for Kafka Microservices');
    console.log('==============================================');
    console.log(`Target: ${this.baseUrl}`);
    console.log(`Concurrency: ${this.concurrency} workers`);
    console.log(`Duration: ${this.duration / 1000}s`);
    console.log(`Ramp-up: ${this.rampUp / 1000}s`);
    console.log('');

    // Start workers with ramp-up
    const workers = [];
    for (let i = 0; i < this.concurrency; i++) {
      setTimeout(() => {
        workers.push(this.worker());
      }, (i * this.rampUp) / this.concurrency);
    }

    // Progress reporting
    const progressInterval = setInterval(() => {
      const runtime = Date.now() - this.stats.startTime;
      const progress = Math.min(100, (runtime / this.duration) * 100);
      const rps = Math.round((this.stats.requests / runtime) * 1000);
      const successRate =
        this.stats.requests > 0
          ? Math.round((this.stats.successful / this.stats.requests) * 100)
          : 0;

      process.stdout.write(
        `\r🔄 Progress: ${progress.toFixed(1)}% | Requests: ${
          this.stats.requests
        } | RPS: ${rps} | Success: ${successRate}%`
      );
    }, 1000);

    // Wait for all workers to complete
    await Promise.all(workers);
    clearInterval(progressInterval);

    this.printStats();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const options = {};

  // Parse command line arguments
  args.forEach((arg, index) => {
    if (arg === '--concurrency' && args[index + 1]) {
      options.concurrency = parseInt(args[index + 1]);
    } else if (arg === '--duration' && args[index + 1]) {
      options.duration = parseInt(args[index + 1]) * 1000;
    } else if (arg === '--help') {
      console.log(`
Load Test for Kafka Microservices Observability

Usage: node load-test.js [options]

Options:
  --concurrency <n>    Number of concurrent workers (default: 10)
  --duration <n>       Test duration in seconds (default: 60)
  --help              Show this help

Examples:
  node load-test.js --concurrency 20 --duration 120
  npm run test:load
      `);
      process.exit(0);
    }
  });

  const tester = new LoadTester(options);
  await tester.run();

  console.log('\n🎯 Load test completed!');
  console.log(
    '📊 Check SigNoz for performance metrics and traces: http://localhost:3301'
  );
}

if (require.main === module) {
  main().catch(console.error);
}
