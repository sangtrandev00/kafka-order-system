import { LoggerModuleAsyncParams } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';

export const createPinoAsyncConfig = (): LoggerModuleAsyncParams => ({
  inject: [ConfigService],
  useFactory: async (configService: ConfigService) => {
    const isDevelopment = configService.get('NODE_ENV') !== 'production';
    const serviceName = configService.get('SERVICE_NAME', 'kafka-microservices');
    const signozEnabled = configService.get('SIGNOZ_ENABLED') === 'true';
    const signozLogsEndpoint = configService.get('SIGNOZ_LOGS_ENDPOINT');
    const signozAccessToken = configService.get('SIGNOZ_ACCESS_TOKEN');

    const transports = [];

    // Always add pretty printing for development
    if (isDevelopment) {
      transports.push({
        target: 'pino-pretty',
        level: 'debug',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname',
          messageFormat: '[{context}] {msg}',
          errorLikeObjectKeys: ['err', 'error'],
        },
      });
    }

    // Add SigNoz transport if enabled
    if (signozEnabled && signozLogsEndpoint) {
      transports.push({
        target: 'pino-opentelemetry-transport',
        level: isDevelopment ? 'debug' : 'info',
        options: {
          loggerName: serviceName,
          serviceVersion: '1.0.0',
          resourceAttributes: {
            'service.name': serviceName,
            'service.version': '1.0.0',
            'deployment.environment': configService.get('NODE_ENV', 'development'),
          },
          logRecordProcessorOptions: {
            recordProcessorType: 'batch',
            exporterOptions: {
              protocol: 'http',
              url: signozLogsEndpoint,
              headers: signozAccessToken ? {
                'signoz-access-token': signozAccessToken,
              } : {},
            },
          },
        },
      });
    }

    return {
      pinoHttp: {
        level: isDevelopment ? 'debug' : 'info',
        transport: transports.length > 0 ? transports : undefined,
        customProps: (req, res) => ({
          context: 'HTTP',
          userId: req.headers['x-user-id'],
          correlationId: req.headers['x-correlation-id'],
        }),
        serializers: {
          req: (req) => ({
            method: req.method,
            url: req.url,
            headers: {
              host: req.headers.host,
              'user-agent': req.headers['user-agent'],
              'content-type': req.headers['content-type'],
            },
          }),
          res: (res) => ({
            statusCode: res.statusCode,
          }),
        },
        // Add trace context to every log automatically
        mixin: () => {
          // This will be enhanced by OpenTelemetry instrumentation
          return {};
        },
      },
    };
  },
});