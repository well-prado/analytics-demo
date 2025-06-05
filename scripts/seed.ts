#!/usr/bin/env ts-node

import { faker } from '@faker-js/faker';
import * as pg from 'pg';
import { config } from 'dotenv';

// Load environment variables
config({ path: '.env.local' });

/**
 * Company Analytics Data Seeder
 * 
 * Generates realistic business data for 6 departments based on CSV metrics:
 * - Sales (16 metrics): Pipeline, ARR, POCs, meetings
 * - Finance (14 metrics): Cash flow, burn rate, runway
 * - DevRel (15 metrics): GitHub, Discord, YouTube engagement
 * - HR (7 metrics): Turnover, satisfaction, hiring
 * - Events (11 metrics): Hosting, attendance, conversions
 * - Policy & Compliance (11 metrics): Training, vulnerabilities
 * 
 * Features:
 * - 2+ years of historical data
 * - Seasonal patterns and trends
 * - Realistic business metrics
 * - Zero hardcoded values
 */

interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

// Department configurations based on CSV analysis
const DEPARTMENTS = {
  sales: {
    name: 'Sales',
    metrics: [
      'total_pipeline', 'channel_partner_pipeline', 'startups_in_pipeline',
      'midmarket_in_pipeline', 'enterprise_in_pipeline', 'active_pocs',
      'potential_pocs', 'hot_accounts', 'meetings_done', 'potential_arr',
      'actual_arr', 'event_pipeline', 'pipeline_growth_30d', 'pipeline_growth_90d',
      'pipeline_growth_365d', 'startup_pipeline_growth'
    ]
  },
  finance: {
    name: 'Finance & Accounting',
    metrics: [
      'cash_available', 'cash_burn_rate', 'runway_remaining', 'fundraising_progress',
      'month_end_close_time', 'error_rate_financial', 'expenditures_actual',
      'expenditures_growth', 'total_debt', 'vendor_obligations', 'cost_per_employee',
      'payroll_expenses', 'admin_expenses', 'software_subscriptions'
    ]
  },
  devrel: {
    name: 'DevRel',
    metrics: [
      'twitter_followers', 'tweets_count', 'twitter_comments', 'github_stars',
      'github_issues', 'github_contributors', 'discord_members', 'discord_messages',
      'youtube_videos', 'youtube_views', 'youtube_subscribers', 'feedbacks_gathered',
      'sales_opportunities_created', 'blog_subscribers', 'blog_likes'
    ]
  },
  hr: {
    name: 'HR',
    metrics: [
      'employee_turnover_rate', 'employee_satisfaction', 'new_hires',
      'employee_count', 'contractor_count', 'vacation_days_used',
      'vacation_days_department'
    ]
  },
  events: {
    name: 'Events',
    metrics: [
      'events_hosted', 'total_signups', 'avg_signups_per_event', 'total_attendees',
      'avg_attendees_per_event', 'signup_vs_attendance', 'github_views',
      'platform_views', 'platform_signups', 'sales_opportunities', 'money_spent'
    ]
  },
  compliance: {
    name: 'Policy & Compliance',
    metrics: [
      'training_completion_rate', 'policy_acknowledgment_rate', 'risk_assessments',
      'vulnerabilities_identified', 'vulnerability_resolution_time', 'vulnerabilities_past_due',
      'vulnerabilities_within_sla', 'open_vulnerabilities', 'assets_scanned',
      'audit_readiness', 'missed_sla_department'
    ]
  }
};

class CompanyDataSeeder {
  private client: pg.Client;
  private startDate: Date;
  private endDate: Date;

  constructor() {
    // Database configuration from environment
    const dbConfig: DatabaseConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'analytics_demo',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || ''
    };

    this.client = new pg.Client(dbConfig);
    
    // Generate 2+ years of historical data
    this.endDate = new Date();
    this.startDate = new Date();
    this.startDate.setFullYear(this.endDate.getFullYear() - 2);
    this.startDate.setMonth(0, 1); // Start from January 1st, 2 years ago
  }

  async seed(): Promise<void> {
    try {
      console.log('🚀 Starting company analytics data seeding...');
      
      await this.client.connect();
      console.log('✅ Connected to database');

      // Create database schema
      await this.createTables();
      console.log('✅ Database tables created');

      // Seed departments
      await this.seedDepartments();
      console.log('✅ Departments seeded');

      // Seed employees
      await this.seedEmployees();
      console.log('✅ Employees seeded');

      // Seed historical metrics data
      await this.seedMetricsData();
      console.log('✅ Historical metrics data seeded');

      console.log('🎉 Company analytics data seeding completed successfully!');
      
    } catch (error) {
      console.error('❌ Seeding failed:', error);
      throw error;
    } finally {
      await this.client.end();
    }
  }

  private async createTables(): Promise<void> {
    // Drop existing tables
    await this.client.query('DROP SCHEMA IF EXISTS public CASCADE;');
    await this.client.query('CREATE SCHEMA public;');

    // Create departments table
    await this.client.query(`
      CREATE TABLE departments (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        code VARCHAR(50) NOT NULL UNIQUE,
        description TEXT,
        head_of_department VARCHAR(255),
        budget DECIMAL(15,2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create employees table
    await this.client.query(`
      CREATE TABLE employees (
        id SERIAL PRIMARY KEY,
        department_id INTEGER REFERENCES departments(id),
        first_name VARCHAR(255) NOT NULL,
        last_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        position VARCHAR(255),
        salary DECIMAL(12,2),
        hire_date DATE,
        employment_type VARCHAR(50), -- 'employee' or 'contractor'
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create metrics table for all department KPIs
    await this.client.query(`
      CREATE TABLE metrics (
        id SERIAL PRIMARY KEY,
        department_id INTEGER REFERENCES departments(id),
        metric_name VARCHAR(255) NOT NULL,
        metric_value DECIMAL(15,4),
        metric_date DATE NOT NULL,
        duration_type VARCHAR(50), -- 'present_value', '30_days', '90_days', '365_days'
        source_system VARCHAR(255),
        weekly_change_percent DECIMAL(8,4),
        monthly_change_percent DECIMAL(8,4),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes for better query performance
    await this.client.query('CREATE INDEX idx_metrics_date ON metrics(metric_date);');
    await this.client.query('CREATE INDEX idx_metrics_department ON metrics(department_id);');
    await this.client.query('CREATE INDEX idx_metrics_name ON metrics(metric_name);');
    await this.client.query('CREATE INDEX idx_employees_department ON employees(department_id);');
  }

  private async seedDepartments(): Promise<void> {
    const departments = Object.entries(DEPARTMENTS).map(([code, dept]) => ({
      name: dept.name,
      code: code,
      description: `${dept.name} department managing ${dept.metrics.length} key metrics`,
      head_of_department: faker.person.fullName(),
      budget: faker.number.float({ min: 500000, max: 5000000, fractionDigits: 2 })
    }));

    for (const dept of departments) {
      await this.client.query(`
        INSERT INTO departments (name, code, description, head_of_department, budget)
        VALUES ($1, $2, $3, $4, $5)
      `, [dept.name, dept.code, dept.description, dept.head_of_department, dept.budget]);
    }
  }

  private async seedEmployees(): Promise<void> {
    // Get department IDs
    const deptResult = await this.client.query('SELECT id, code FROM departments');
    const departments = deptResult.rows;

    // Generate employees for each department
    for (const dept of departments) {
      const employeeCount = faker.number.int({ min: 5, max: 25 });
      
      for (let i = 0; i < employeeCount; i++) {
        const firstName = faker.person.firstName();
        const lastName = faker.person.lastName();
        const email = faker.internet.email({ firstName, lastName, provider: 'company.com' });
        const position = this.generatePosition(dept.code);
        const salary = faker.number.float({ min: 60000, max: 200000, fractionDigits: 2 });
        const hireDate = faker.date.between({ from: this.startDate, to: this.endDate });
        const employmentType = faker.helpers.weightedArrayElement([
          { weight: 0.8, value: 'employee' },
          { weight: 0.2, value: 'contractor' }
        ]);

        await this.client.query(`
          INSERT INTO employees (department_id, first_name, last_name, email, position, salary, hire_date, employment_type)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [dept.id, firstName, lastName, email, position, salary, hireDate, employmentType]);
      }
    }
  }

  private generatePosition(deptCode: string): string {
    const positions = {
      sales: ['Sales Rep', 'Account Executive', 'Sales Manager', 'Business Development Rep', 'Sales Director'],
      finance: ['Financial Analyst', 'Accountant', 'Finance Manager', 'Controller', 'CFO'],
      devrel: ['Developer Advocate', 'Community Manager', 'Technical Writer', 'DevRel Manager', 'Developer Experience Engineer'],
      hr: ['HR Generalist', 'Recruiter', 'HR Manager', 'People Operations', 'HR Director'],
      events: ['Event Coordinator', 'Event Manager', 'Marketing Events Specialist', 'Conference Manager', 'Events Director'],
      compliance: ['Compliance Officer', 'Security Analyst', 'Risk Manager', 'Audit Specialist', 'Compliance Manager']
    };

    return faker.helpers.arrayElement(positions[deptCode as keyof typeof positions] || ['Employee']);
  }

  private async seedMetricsData(): Promise<void> {
    // Get department IDs
    const deptResult = await this.client.query('SELECT id, code FROM departments');
    const departments = deptResult.rows;

    // Generate historical data for each department
    for (const dept of departments) {
      const deptConfig = DEPARTMENTS[dept.code as keyof typeof DEPARTMENTS];
      
      for (const metricName of deptConfig.metrics) {
        await this.generateMetricTimeSeries(dept.id, metricName, dept.code);
      }
    }
  }

  private async generateMetricTimeSeries(departmentId: number, metricName: string, deptCode: string): Promise<void> {
    const currentDate = new Date(this.startDate);
    
    // Generate weekly data points
    while (currentDate <= this.endDate) {
      const metricValue = this.generateRealisticMetricValue(metricName, deptCode, currentDate);
      const durationType = this.getDurationType(metricName);
      const sourceSystem = this.getSourceSystem(metricName);
      
      // Calculate percentage changes (simulate growth/decline)
      const weeklyChange = faker.number.float({ min: -10, max: 15, fractionDigits: 2 });
      const monthlyChange = faker.number.float({ min: -25, max: 40, fractionDigits: 2 });

      await this.client.query(`
        INSERT INTO metrics (department_id, metric_name, metric_value, metric_date, duration_type, source_system, weekly_change_percent, monthly_change_percent)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [departmentId, metricName, metricValue, currentDate.toISOString().split('T')[0], durationType, sourceSystem, weeklyChange, monthlyChange]);

      // Move to next week
      currentDate.setDate(currentDate.getDate() + 7);
    }
  }

  private generateRealisticMetricValue(metricName: string, deptCode: string, date: Date): number {
    // Generate realistic values based on metric type and seasonal patterns
    const baseValues = {
      // Sales metrics
      total_pipeline: () => faker.number.float({ min: 500000, max: 2000000 }),
      actual_arr: () => faker.number.float({ min: 100000, max: 800000 }),
      meetings_done: () => faker.number.int({ min: 20, max: 80 }),
      
      // Finance metrics  
      cash_available: () => faker.number.float({ min: 1000000, max: 10000000 }),
      cash_burn_rate: () => faker.number.float({ min: 50000, max: 300000 }),
      runway_remaining: () => faker.number.float({ min: 12, max: 36 }),
      
      // DevRel metrics
      twitter_followers: () => faker.number.int({ min: 1000, max: 50000 }),
      github_stars: () => faker.number.int({ min: 100, max: 10000 }),
      youtube_subscribers: () => faker.number.int({ min: 500, max: 25000 }),
      
      // HR metrics
      employee_turnover_rate: () => faker.number.float({ min: 2, max: 15 }),
      employee_satisfaction: () => faker.number.float({ min: 3.5, max: 5.0 }),
      new_hires: () => faker.number.int({ min: 1, max: 10 }),
      
      // Events metrics
      events_hosted: () => faker.number.int({ min: 1, max: 8 }),
      total_attendees: () => faker.number.int({ min: 50, max: 500 }),
      money_spent: () => faker.number.float({ min: 5000, max: 50000 }),
      
      // Compliance metrics
      training_completion_rate: () => faker.number.float({ min: 70, max: 98 }),
      vulnerabilities_identified: () => faker.number.int({ min: 5, max: 50 }),
      audit_readiness: () => faker.number.float({ min: 60, max: 95 })
    };

    // Apply seasonal variations (Q4 boost for sales, etc.)
    const month = date.getMonth();
    const seasonalMultiplier = this.getSeasonalMultiplier(metricName, month);
    
    const baseValue = baseValues[metricName as keyof typeof baseValues]?.() || faker.number.float({ min: 100, max: 10000 });
    return Number((baseValue * seasonalMultiplier).toFixed(4));
  }

  private getSeasonalMultiplier(metricName: string, month: number): number {
    // Q4 (Oct-Dec) boost for sales and events
    if (['total_pipeline', 'actual_arr', 'events_hosted'].includes(metricName)) {
      return month >= 9 ? 1.3 : 1.0; // 30% boost in Q4
    }
    
    // Summer dip for HR metrics (vacation season)
    if (['employee_satisfaction', 'new_hires'].includes(metricName)) {
      return month >= 5 && month <= 7 ? 0.85 : 1.0; // 15% decrease in summer
    }
    
    return 1.0; // Default: no seasonal variation
  }

  private getDurationType(metricName: string): string {
    // Map duration types based on CSV data patterns
    if (metricName.includes('growth') || metricName.includes('change')) {
      return '30_days';
    }
    if (metricName.includes('rate') || metricName.includes('count')) {
      return 'present_value';
    }
    return '30_days';
  }

  private getSourceSystem(metricName: string): string {
    // Map source systems based on CSV data
    const sourceMappings = {
      // Sales sources
      pipeline: 'Attio', arr: 'Attio', meetings: 'Calendly',
      // Finance sources  
      cash: 'Excel', burn: 'Excel', fundraising: 'Carta',
      // DevRel sources
      twitter: 'X', github: 'GitHub', youtube: 'YouTube', discord: 'Discord',
      // HR sources
      employee: 'Rippling', satisfaction: 'Surveys',
      // Events sources
      events: 'Luma', attendees: 'Luma',
      // Compliance sources
      training: 'Vanta', vulnerabilities: 'Vanta'
    };

    for (const [key, source] of Object.entries(sourceMappings)) {
      if (metricName.includes(key)) {
        return source;
      }
    }
    
    return 'Internal System';
  }
}

// Main execution
async function main() {
  try {
    const seeder = new CompanyDataSeeder();
    await seeder.seed();
    console.log('✅ Seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { CompanyDataSeeder }; 