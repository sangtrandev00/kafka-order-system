import { Injectable } from '@nestjs/common';
import { LogEvent } from '@kafka-microservices/shared';

@Injectable()
export class LoggerService {
  private logs: LogEvent[] = []; // In production, use a database or external logging service

  async logEvent(eventType: string, payload: any): Promise<void> {
    const logEvent: LogEvent = {
      eventType,
      timestamp: new Date(),
      payload,
      service: 'logger-service',
    };

    // Store the log (in production, save to database or send to logging service)
    this.logs.push(logEvent);

    console.log('📝 Event logged:', {
      eventType: logEvent.eventType,
      timestamp: logEvent.timestamp.toISOString(),
      service: logEvent.service,
      payload: JSON.stringify(logEvent.payload, null, 2),
    });

    // In a real application, you might:
    // - Save to a database (MongoDB, PostgreSQL, etc.)
    // - Send to a logging service (ELK Stack, Splunk, etc.)
    // - Send to a monitoring service (Datadog, New Relic, etc.)
    // - Write to files with rotation

    console.log(`📊 Total events logged: ${this.logs.length}`);
  }

  async getLogs(): Promise<LogEvent[]> {
    return this.logs;
  }

  async getLogsByEventType(eventType: string): Promise<LogEvent[]> {
    return this.logs.filter((log) => log.eventType === eventType);
  }

  async getLogsByTimeRange(
    startTime: Date,
    endTime: Date
  ): Promise<LogEvent[]> {
    return this.logs.filter(
      (log) => log.timestamp >= startTime && log.timestamp <= endTime
    );
  }
}
