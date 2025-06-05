import {
	type INanoServiceResponse,
	NanoService,
	NanoServiceResponse,
} from "@nanoservice-ts/runner";
import { type Context, GlobalError } from "@nanoservice-ts/shared";

/**
 * Input schema for business context query generation
 */
type BusinessQueryInput = {
	/** Natural language query from user */
	query: string;
	/** Optional department filter */
	department?: string;
	/** Optional date range specification */
	date_range?: string;
	/** Include debug information in response */
	debug?: boolean;
};

/**
 * Generated SQL query with context
 */
type GeneratedQuery = {
	sql: string;
	parameters: any[];
	explanation: string;
	matched_patterns: string[];
	department_filter?: string;
	date_filter?: string;
	aggregation_type?: string;
};

/**
 * BusinessContextQueryNode - Pure pattern matching for natural language to SQL
 * 
 * This node converts natural language business queries into SQL without external AI APIs.
 * It uses predefined patterns and business rules to understand common analytics requests.
 * 
 * Supported Query Patterns:
 * - Time-based: "Q4 sales", "last month", "this year"
 * - Comparisons: "top performers", "best metrics", "worst results"  
 * - Departments: "sales team", "finance department", "devrel metrics"
 * - Aggregations: "total revenue", "average satisfaction", "growth rate"
 * - Trends: "trending up", "declining", "growth over time"
 * 
 * No external AI dependencies - pure TypeScript pattern matching!
 */
export default class BusinessContextQueryNode extends NanoService<BusinessQueryInput> {
	constructor() {
		super();

		// Input validation schema
		this.inputSchema = {
			$schema: "http://json-schema.org/draft-04/schema#",
			type: "object",
			properties: {
				query: { 
					type: "string", 
					description: "Natural language business query" 
				},
				department: { 
					type: "string", 
					description: "Optional department filter (sales, finance, hr, etc.)" 
				},
				date_range: { 
					type: "string", 
					description: "Optional date range (Q1, Q4, last_month, this_year)" 
				},
				debug: { 
					type: "boolean", 
					description: "Include pattern matching debug information",
					default: false
				}
			},
			required: ["query"]
		};

		// Output schema
		this.outputSchema = {
			$schema: "http://json-schema.org/draft-04/schema#",
			type: "object",
			properties: {
				sql: { type: "string" },
				parameters: { type: "array" },
				explanation: { type: "string" },
				matched_patterns: { type: "array" },
				department_filter: { type: "string" },
				date_filter: { type: "string" },
				aggregation_type: { type: "string" }
			},
			required: ["sql", "parameters", "explanation", "matched_patterns"]
		};
	}

	async handle(ctx: Context, inputs: BusinessQueryInput): Promise<INanoServiceResponse> {
		const response: NanoServiceResponse = new NanoServiceResponse();

		try {
			// Get database schema from previous node
			const dbSchema = ctx.vars?.database_schema;
			if (!dbSchema) {
				throw new Error(
					"Database schema not found. Please run schema-discovery node first."
				);
			}

			// Generate SQL query using pattern matching
			const generatedQuery = await this.generateSQLFromNaturalLanguage(
				inputs.query,
				dbSchema,
				inputs.department,
				inputs.date_range,
				inputs.debug || false
			);

			// Store generated query in context for execution
			if (!ctx.vars) ctx.vars = {};
			ctx.vars.generated_query = generatedQuery.sql as any;
			ctx.vars.query_parameters = generatedQuery.parameters as any;

			response.setSuccess(generatedQuery as any);

		} catch (error: unknown) {
			const nodeError = new GlobalError((error as Error).message);
			nodeError.setCode(500);
			nodeError.setStack((error as Error).stack);
			nodeError.setName(this.name);
			response.setError(nodeError);
		}

		return response;
	}

	/**
	 * Generate SQL from natural language using pure pattern matching
	 */
	private async generateSQLFromNaturalLanguage(
		query: string,
		dbSchema: any,
		departmentFilter?: string,
		dateRange?: string,
		debug: boolean = false
	): Promise<GeneratedQuery> {
		const queryLower = query.toLowerCase();
		const matchedPatterns: string[] = [];
		
		// Parse query components
		const components = {
			department: this.extractDepartment(queryLower, departmentFilter) || undefined,
			dateRange: this.extractDateRange(queryLower, dateRange),
			aggregation: this.extractAggregation(queryLower),
			metrics: this.extractMetrics(queryLower),
			comparison: this.extractComparison(queryLower),
			limit: this.extractLimit(queryLower)
		};

		// Build SQL query
		let sql = "SELECT ";
		const parameters: any[] = [];
		
		// SELECT clause
		if (components.aggregation.type === 'none') {
			sql += "d.name as department, m.metric_name, m.metric_value, m.metric_date";
			matchedPatterns.push("basic_selection");
		} else {
			sql += this.buildAggregationSelect(components.aggregation);
			matchedPatterns.push(`aggregation_${components.aggregation.type}`);
		}

		// FROM clause
		sql += " FROM metrics m";
		sql += " INNER JOIN departments d ON m.department_id = d.id";

		// WHERE clause
		const whereConditions: string[] = [];
		
		// Department filter
		if (components.department) {
			whereConditions.push("d.code = $" + (parameters.length + 1));
			parameters.push(components.department);
			matchedPatterns.push("department_filter");
		}

		// Date filter
		if (components.dateRange.sql) {
			whereConditions.push(components.dateRange.sql);
			if (components.dateRange.parameters) {
				parameters.push(...components.dateRange.parameters);
			}
			matchedPatterns.push(`date_filter_${components.dateRange.type}`);
		}

		// Metric filter
		if (components.metrics.length > 0) {
			const metricPlaceholders = components.metrics.map((_, index) => 
				"$" + (parameters.length + index + 1)
			).join(", ");
			whereConditions.push(`m.metric_name IN (${metricPlaceholders})`);
			parameters.push(...components.metrics);
			matchedPatterns.push("metric_filter");
		}

		if (whereConditions.length > 0) {
			sql += " WHERE " + whereConditions.join(" AND ");
		}

		// GROUP BY clause (for aggregations)
		if (components.aggregation.type !== 'none') {
			sql += this.buildGroupBy(components.aggregation, components.department ? false : true);
		}

		// ORDER BY clause
		sql += this.buildOrderBy(components.comparison, components.aggregation);
		if (components.comparison.type !== 'none') {
			matchedPatterns.push(`comparison_${components.comparison.type}`);
		}

		// LIMIT clause
		if (components.limit > 0) {
			sql += " LIMIT " + components.limit;
			matchedPatterns.push("limit_results");
		}

		// Generate explanation
		const explanation = this.generateExplanation(components, matchedPatterns);

		return {
			sql,
			parameters,
			explanation,
			matched_patterns: matchedPatterns,
			department_filter: components.department,
			date_filter: components.dateRange.type,
			aggregation_type: components.aggregation.type
		};
	}

	/**
	 * Extract department from query
	 */
	private extractDepartment(query: string, explicitDept?: string): string | null {
		if (explicitDept) return explicitDept;

		const departmentPatterns = {
			sales: ['sales', 'revenue', 'pipeline', 'arr', 'deals'],
			finance: ['finance', 'financial', 'cash', 'burn', 'runway', 'expenses'],
			devrel: ['devrel', 'developer', 'github', 'community', 'twitter', 'discord'],
			hr: ['hr', 'human resources', 'employee', 'hiring', 'turnover', 'satisfaction'],
			events: ['events', 'conferences', 'meetups', 'attendees', 'signups'],
			compliance: ['compliance', 'security', 'vulnerabilities', 'training', 'audit']
		};

		for (const [dept, keywords] of Object.entries(departmentPatterns)) {
			if (keywords.some(keyword => query.includes(keyword))) {
				return dept;
			}
		}

		return null;
	}

	/**
	 * Extract date range from query
	 */
	private extractDateRange(query: string, explicitRange?: string): { type: string; sql: string; parameters?: any[] } {
		if (explicitRange) {
			return this.parseDateRange(explicitRange);
		}

		// Quarter patterns
		if (query.includes('q4') || query.includes('fourth quarter')) {
			return {
				type: 'q4',
				sql: "EXTRACT(QUARTER FROM m.metric_date) = 4 AND EXTRACT(YEAR FROM m.metric_date) = EXTRACT(YEAR FROM CURRENT_DATE)",
				parameters: []
			};
		}
		if (query.includes('q1') || query.includes('first quarter')) {
			return {
				type: 'q1',
				sql: "EXTRACT(QUARTER FROM m.metric_date) = 1 AND EXTRACT(YEAR FROM m.metric_date) = EXTRACT(YEAR FROM CURRENT_DATE)",
				parameters: []
			};
		}

		// Month patterns
		if (query.includes('last month')) {
			return {
				type: 'last_month',
				sql: "m.metric_date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month') AND m.metric_date < DATE_TRUNC('month', CURRENT_DATE)",
				parameters: []
			};
		}
		if (query.includes('this month')) {
			return {
				type: 'this_month',
				sql: "m.metric_date >= DATE_TRUNC('month', CURRENT_DATE)",
				parameters: []
			};
		}

		// Year patterns
		if (query.includes('this year')) {
			return {
				type: 'this_year',
				sql: "EXTRACT(YEAR FROM m.metric_date) = EXTRACT(YEAR FROM CURRENT_DATE)",
				parameters: []
			};
		}

		return { type: 'none', sql: '', parameters: [] };
	}

	/**
	 * Parse explicit date range
	 */
	private parseDateRange(range: string): { type: string; sql: string; parameters?: any[] } {
		const rangeLower = range.toLowerCase();
		
		if (rangeLower === 'q4') {
			return {
				type: 'q4',
				sql: "EXTRACT(QUARTER FROM m.metric_date) = 4",
				parameters: []
			};
		}

		return { type: 'custom', sql: '', parameters: [] };
	}

	/**
	 * Extract aggregation type from query
	 */
	private extractAggregation(query: string): { type: string; function: string } {
		if (query.includes('total') || query.includes('sum')) {
			return { type: 'sum', function: 'SUM' };
		}
		if (query.includes('average') || query.includes('avg')) {
			return { type: 'avg', function: 'AVG' };
		}
		if (query.includes('count') || query.includes('number of')) {
			return { type: 'count', function: 'COUNT' };
		}
		if (query.includes('growth') || query.includes('trend')) {
			return { type: 'growth', function: 'SUM' }; // We'll calculate growth separately
		}

		return { type: 'none', function: '' };
	}

	/**
	 * Extract specific metrics mentioned in query
	 */
	private extractMetrics(query: string): string[] {
		const metricPatterns = {
			'pipeline': ['total_pipeline', 'channel_partner_pipeline'],
			'revenue': ['actual_arr', 'potential_arr'],
			'cash': ['cash_available', 'cash_burn_rate'],
			'satisfaction': ['employee_satisfaction'],
			'turnover': ['employee_turnover_rate'],
			'followers': ['twitter_followers'],
			'stars': ['github_stars']
		};

		const foundMetrics: string[] = [];
		
		for (const [keyword, metrics] of Object.entries(metricPatterns)) {
			if (query.includes(keyword)) {
				foundMetrics.push(...metrics);
			}
		}

		return foundMetrics;
	}

	/**
	 * Extract comparison/sorting requirements
	 */
	private extractComparison(query: string): { type: string; direction: string } {
		if (query.includes('top') || query.includes('best') || query.includes('highest')) {
			return { type: 'top', direction: 'DESC' };
		}
		if (query.includes('bottom') || query.includes('worst') || query.includes('lowest')) {
			return { type: 'bottom', direction: 'ASC' };
		}

		return { type: 'none', direction: '' };
	}

	/**
	 * Extract result limit from query
	 */
	private extractLimit(query: string): number {
		const limitPatterns = [
			{ pattern: /top (\d+)/, multiplier: 1 },
			{ pattern: /first (\d+)/, multiplier: 1 },
			{ pattern: /(\d+) (top|best|worst)/, multiplier: 1 }
		];

		for (const { pattern } of limitPatterns) {
			const match = query.match(pattern);
			if (match) {
				return parseInt(match[1]);
			}
		}

		// Default limits based on query type
		if (query.includes('top') || query.includes('best')) {
			return 10;
		}

		return 0; // No limit
	}

	/**
	 * Build aggregation SELECT clause
	 */
	private buildAggregationSelect(aggregation: { type: string; function: string }): string {
		if (aggregation.type === 'growth') {
			return "d.name as department, m.metric_name, " +
				   "AVG(m.monthly_change_percent) as growth_rate";
		}

		return `d.name as department, m.metric_name, ${aggregation.function}(m.metric_value) as aggregated_value`;
	}

	/**
	 * Build GROUP BY clause
	 */
	private buildGroupBy(aggregation: { type: string }, includeDepartment: boolean): string {
		if (includeDepartment) {
			return " GROUP BY d.name, m.metric_name";
		}
		return " GROUP BY m.metric_name";
	}

	/**
	 * Build ORDER BY clause
	 */
	private buildOrderBy(comparison: { type: string; direction: string }, aggregation: { type: string }): string {
		if (comparison.type === 'none') {
			return " ORDER BY m.metric_date DESC";
		}

		const orderColumn = aggregation.type !== 'none' ? 
			(aggregation.type === 'growth' ? 'growth_rate' : 'aggregated_value') :
			'm.metric_value';

		return ` ORDER BY ${orderColumn} ${comparison.direction}`;
	}

	/**
	 * Generate human-readable explanation
	 */
	private generateExplanation(components: any, patterns: string[]): string {
		let explanation = "Generated SQL query to ";

		if (components.aggregation.type !== 'none') {
			explanation += `calculate ${components.aggregation.type} of `;
		} else {
			explanation += "retrieve ";
		}

		if (components.metrics.length > 0) {
			explanation += `${components.metrics.join(', ')} metrics`;
		} else {
			explanation += "metrics";
		}

		if (components.department) {
			explanation += ` for ${components.department} department`;
		}

		if (components.dateRange.type !== 'none') {
			explanation += ` filtered by ${components.dateRange.type.replace('_', ' ')}`;
		}

		if (components.comparison.type !== 'none') {
			explanation += ` showing ${components.comparison.type} results`;
		}

		explanation += `. Matched patterns: ${patterns.join(', ')}.`;

		return explanation;
	}
} 