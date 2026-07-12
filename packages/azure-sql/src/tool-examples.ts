export { descWithExamples } from '@mcp-consultant-tools/core';

export const SQL_QUERY_EXAMPLES = [
  { label: 'Active users', value: "SELECT TOP 100 * FROM Users WHERE IsActive = 1" },
  { label: 'Join with aggregation', value: "SELECT t.Name, COUNT(*) as OrderCount FROM Orders o JOIN Customers t ON o.CustomerId = t.Id GROUP BY t.Name" },
  { label: 'List all tables', value: "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'" },
];

export const TABLE_NAME_EXAMPLES = [
  { label: 'Users table', value: 'dbo.Users' },
  { label: 'Orders table', value: 'dbo.Orders' },
  { label: 'Audit log', value: 'dbo.AuditLog' },
];

export const SERVER_ID_EXAMPLES = [
  { label: 'Default (single server)', value: 'default' },
  { label: 'Production', value: 'prod' },
  { label: 'Staging', value: 'staging' },
];

export const SCHEMA_NAME_EXAMPLES = [
  { label: 'Default schema', value: 'dbo' },
  { label: 'Custom schema', value: 'sales' },
];

export const OBJECT_TYPE_EXAMPLES = [
  { label: 'View definition', value: 'VIEW' },
  { label: 'Stored procedure', value: 'PROCEDURE' },
  { label: 'User function', value: 'FUNCTION' },
  { label: 'Table trigger', value: 'TRIGGER' },
];

export const VIEW_BODY_EXAMPLES = [
  { label: 'Simple view', value: 'SELECT Id, Name, Email FROM dbo.Users WHERE IsActive = 1' },
  { label: 'Join view', value: 'SELECT o.Id, o.OrderDate, c.Name AS CustomerName FROM dbo.Orders o JOIN dbo.Customers c ON o.CustomerId = c.Id' },
];

export const SPROC_DEFINITION_EXAMPLES = [
  { label: 'Simple query proc', value: '@Status INT\nAS\nBEGIN\n  SELECT * FROM dbo.Orders WHERE StatusId = @Status;\nEND' },
  { label: 'Insert proc', value: '@Name NVARCHAR(100), @Email NVARCHAR(200)\nAS\nBEGIN\n  INSERT INTO dbo.Users (Name, Email) VALUES (@Name, @Email);\nEND' },
];

export const SPROC_PARAMS_EXAMPLES = [
  { label: 'Single parameter', value: '{"Status": 1}' },
  { label: 'Multiple parameters', value: '{"Name": "John Doe", "Email": "john@example.com"}' },
];

export const VIEW_FILE_PATH_EXAMPLES = [
  { label: 'Relative path', value: './sql/views/vw_ActiveUsers.sql' },
  { label: 'Absolute path', value: '/Users/dev/project/db/views/vw_OrderSummary.sql' },
];

export const SPROC_FILE_PATH_EXAMPLES = [
  { label: 'Relative path', value: './sql/stored-procedures/usp_GetActiveUsers.sql' },
  { label: 'Absolute path', value: '/Users/dev/project/db/sprocs/usp_ProcessOrders.sql' },
  { label: 'Windows path', value: 'C:\\Dev\\MyProject\\sql\\usp_UpdateInventory.sql' },
];

export const INSERT_QUERY_EXAMPLES = [
  { label: 'Single row insert', value: "INSERT INTO dbo.Users (Name, Email) VALUES ('Jane Doe', 'jane@example.com')" },
  { label: 'Multi-row insert', value: "INSERT INTO dbo.AuditLog (Action, Timestamp) VALUES ('Login', GETDATE()), ('Logout', GETDATE())" },
];

export const UPDATE_QUERY_EXAMPLES = [
  { label: 'Update by ID', value: "UPDATE dbo.Users SET Email = 'new@example.com' WHERE Id = 42" },
  { label: 'Update with condition', value: "UPDATE dbo.Orders SET Status = 'Shipped' WHERE OrderDate < '2025-01-01' AND Status = 'Pending'" },
];

export const DELETE_QUERY_EXAMPLES = [
  { label: 'Delete by ID', value: "DELETE FROM dbo.AuditLog WHERE Id = 123" },
  { label: 'Delete by condition', value: "DELETE FROM dbo.Sessions WHERE ExpiresAt < GETDATE()" },
];

export const QUERY_PATTERN_EXAMPLES = [
  { label: 'Any statement touching a table', value: 'Orders' },
  { label: 'Updates to a table', value: 'UPDATE%dbo.Orders' },
  { label: 'A stored procedure by name', value: 'usp_GetActiveUsers' },
];

export const QUERY_ID_EXAMPLES = [
  { label: 'Query Store query_id', value: '1234' },
];
