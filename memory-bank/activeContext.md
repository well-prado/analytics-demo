# Active Context: Dynamic Company Analytics Implementation Plan

## Confirmed Requirements

✅ **Company Data**: 6 departments with specific metrics from CSV files  
✅ **Schema**: Use exact structure from metrics CSVs  
✅ **Query Complexity**: Support all levels (simple to complex multi-table JOINs)  
✅ **Configuration**: Environment variables (.env.local)  
✅ **Data Strategy**: Regenerate with seed.ts using Faker + Docker integration  
✅ **AI Strategy**: NO ChatGPT/OpenAI - Pure Claude Desktop + MCP nodes only  
✅ **Code Quality**: Clean, tutorial-ready, easily replicable  

## Company Structure Analysis

### Departments & Metrics Discovered
1. **Sales** (16 metrics): Pipeline, ARR, POCs, meetings, channel partners
2. **Finance & Accounting** (14 metrics): Cash flow, burn rate, runway, expenditures  
3. **DevRel** (15 metrics): Social media, GitHub, Discord, YouTube, blog engagement
4. **HR** (7 metrics): Turnover, satisfaction, hires, vacation usage
5. **Events** (11 metrics): Event hosting, attendance, conversions, ROI
6. **Policy & Compliance** (11 metrics): Training, vulnerabilities, SLA compliance

### Data Model Structure
```sql
-- From CSV analysis:
- Metric: VARCHAR (KPI name)
- Duration: VARCHAR (Present Value, "30, 90, 365", "Last 7 days", etc.)
- Source: VARCHAR (Attio, Excel, GitHub, etc.)
- Weekly/Monthly % Change: DECIMAL (for trend analysis)
```

## Implementation Plan - Tutorial-Ready

### Phase 1: Dynamic Database Foundation (Clean & Simple)

#### 1.1 Create DatabaseConfigNode
**File**: `src/nodes/analytics/database-config/index.ts`
```typescript
// Environment-based connection (no hardcoding)
// Input: optional connection override
// Output: validated DB config object
```

#### 1.2 Create SchemaDiscoveryNode  
**File**: `src/nodes/analytics/schema-discovery/index.ts`
```typescript
// Auto-detect any database structure
// Input: database connection
// Output: complete schema metadata
```

### Phase 2: Company Data Seeding (Faker Integration)

#### 2.1 Create seed.ts with Faker
**File**: `scripts/seed.ts`
```typescript
// Generate realistic company data for all 6 departments
// Use actual metrics from CSV files
// Create 2+ years of historical data
// Seasonal patterns and trends
```

#### 2.2 Update package.json
```json
{
  "scripts": {
    "seed": "ts-node scripts/seed.ts",
    "seed:docker": "docker-compose exec app npm run seed"
  }
}
```

#### 2.3 Docker Integration
Update Docker Compose to auto-seed database on startup

### Phase 3: Natural Language Query Engine (No OpenAI)

#### 3.1 Create BusinessContextQueryNode
**File**: `src/nodes/analytics/business-query/index.ts`
```typescript
// Pure pattern matching + business rules
// No external AI APIs
// Input: natural language query + schema context
// Output: SQL query
```

#### 3.2 Query Pattern Library
```typescript
// Predefined patterns for common business queries:
// "Q4 sales" → date range filtering
// "top performers" → ORDER BY DESC LIMIT
// "growth rate" → percentage calculations
// "department comparison" → GROUP BY with aggregations
```

### Phase 4: Clean Workflow Architecture

#### 4.1 Create company-analytics.json
**File**: `workflows/json/company-analytics.json`
```json
{
  "name": "Dynamic Company Analytics",
  "description": "Claude-powered business analytics with zero hardcoding",
  "trigger": { "http": { "method": "*", "path": "/:query_type?" } },
  "steps": [
    "database-config → schema-discovery → business-query → execute → format"
  ]
}
```

#### 4.2 Response Formatter Node
**File**: `src/nodes/analytics/response-formatter/index.ts`
```typescript
// Business-friendly formatting
// Charts data preparation
// Trend analysis
// Executive summary generation
```

## Detailed Implementation Steps

### Step 1: Setup Database Infrastructure
1. Create `src/nodes/analytics/` directory structure
2. Build DatabaseConfigNode with environment variables
3. Build SchemaDiscoveryNode with information_schema queries
4. Test with existing database

### Step 2: Data Seeding System
1. Create `scripts/seed.ts` with Faker
2. Design company database schema based on CSV metrics
3. Generate 6 department tables with historical data
4. Add seeding command to package.json
5. Integrate with Docker workflow

### Step 3: Business Query Engine
1. Create BusinessContextQueryNode (no external AI)
2. Build query pattern matching system
3. Implement business terminology mapping
4. Add SQL generation logic
5. Test with sample queries

### Step 4: Integration & Testing
1. Create new company-analytics.json workflow
2. Update MCP tool registration
3. Test Claude Desktop integration
4. Verify tutorial-ready code quality

## Success Validation

### Technical Tests
- [ ] `npm run seed` populates database with realistic data
- [ ] Claude can ask "Show me Q4 sales metrics" → Gets correct results
- [ ] Zero hardcoded SQL in any file
- [ ] Works with different database schemas
- [ ] All nodes are reusable across workflows

### Tutorial Requirements  
- [ ] Clean, readable code structure
- [ ] Clear separation of concerns
- [ ] Easy to follow and replicate
- [ ] Well-commented for educational purposes
- [ ] Minimal dependencies and complexity

## Next Immediate Action
**Start with Phase 1**: Create the database infrastructure nodes that eliminate all hardcoding and enable schema-agnostic operations.

## Code Quality Standards for Tutorial
- **File Structure**: Clear, logical organization
- **Naming**: Descriptive, consistent naming conventions  
- **Comments**: Explain WHY, not just WHAT
- **Error Handling**: Graceful, user-friendly error messages
- **Type Safety**: Full TypeScript coverage
- **Modularity**: Each node does one thing well 