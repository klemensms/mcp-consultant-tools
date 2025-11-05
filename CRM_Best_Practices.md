# Best Practices for CRM customisation
Author: Klemens Stelk
Date published 4/11/25

## Publisher - ![Static Badge](https://img.shields.io/badge/Requ._Level:-MUST-red)

<span style="color:red">TODO - add to IT checklist</span> 

- **ALWAYS** use **sic_**  
  - Name: SmartImpactCustomer
  - Prefix: sic_
  - Option Value Prefix: 15,743
  - set contacts details to: unfold below



  <!--⭐️Header⭐️-->
## New Tables - ![Static Badge](https://img.shields.io/badge/Requ._Level:-MUST-red)
- Never use 'Organisational' Ownership (always use 'User or Team') 
- when creating a RefData table, use **sic_ref_** for the schema name
- use all **LOWER** case letters


|                           | Example of naming                  | Explanation             |
|---------------------------|------------------------------------|-------------------------|
| Name                      | Type Of Establishment              |                         |
| Plural Name               | Types Of Establishments            |                         |
| RefData Table Schema Name | sic_<b>ref_</b>typeofestablishment | start the name it: ref_ |
| BAU Table Schema Name     | sic_application                    |                         |

<details>
  <summary style="color: darkgrey; text-decoration: underline;">Explanation/Reasoning</summary>
--> Makes it easy to identify the purpose of the table when interacting with it 'in code' (e.g. via smartConnectorCloud) 
  <br> 
--> Makes it easy to setup and maintain the '{Client} - RBAC' security roles, as the new UI allows you to search for tables with 'ref_' in them 
</details>



<!--⭐️Header⭐️-->
# Columns - ![Static Badge](https://img.shields.io/badge/Requ._Level:-Should-blue)
- do NOT use booleans (unless you are absolutely certain that you must use one)
- DateTime: use 'Time Zone Independent' unless you are dealing with a CRM that will be used in countries with different time zones
  - Example name: Display name: _Start Date_  - Schema Name: _sic_startdate_

|           | Name       | Schema Name   | Explanation                                       |
|-----------|------------|---------------|---------------------------------------------------|
| Lookup    | Contact    | sic_contactid | all lower case, **sic_**{target_table_name}**id** |
| all other | Start Date | sic_startdate | schema name matches field name, all lower case    |




<!--⭐️Header⭐️-->
# Table Status - ![Static Badge](https://img.shields.io/badge/Requ._Level:-Should-blue)

- Do **not** use the **OOTB state & status reason** unless '_deactivation_' or '_status reason transition_' is part of the business process 
- **Default to a global option set** for simplicity and reusability
- Use a **RefData table** **only when needed** — specifically when:
  - Status logic must be **data-driven** or extensible (adding/removing/renaming statuses)
  - Additional **metadata (e.g. portal display name), transitions, or role-based rules** are required.
  - there are many options 
  - different teams use different sets of statuses

<a href="https://smartimpactuk.visualstudio.com/DevOps/_wiki/wikis/DevOps.wiki/4262/CRM-Best-Practice-Status-Column-Design" target="_blank">Detailed list of reasons and explanations</a>



<!--⭐️Header⭐️-->
#'New Table Checklist' - ![Static Badge](https://img.shields.io/badge/Requ._Level:-MUST-red)


Page Owner:  @<Klemens Stelk> 
Last updated on: 2025_02_08

> How to use this: copy the list below into your user story / task, delete lines as you complete them, skip whatever does not apply


- How to reach the old setting: https://rtpidev.crm11.dynamics.com/main.aspx?settingsonly=true
  - add ``/main.aspx?settingsonly=true`` to the end of the url
- ## Creation
  - ### Create new table
    - schema name if Reference data: sic_ref_
    - uncheck all 'table features' that are not required
    - rename the primary columns if required, at least update the schema name to `sic_name` (with a lower case n)
  - ### Add Client Columns
    - as per wireframes
  - ### Add Generic Columns
    - All tables (except reference data tables) should have this column
    - `Updated by process` `This field is updated, each time an automated process updates this record.` `updatedbyprocess` `4000`



  - ### Add Reference Data Columns:
    - `Start Date` `The date this reference data record started being used.` `startdate`
      - Date only - Timezone independent
    - `End Date` `The date this reference data record stopped being used.` `enddate`
      - Date only - Timezone independent
    - `Description` `Useful information about this reference data record.` `description`
      - Multiple lines plain text - 20,000
    - `Code` `Code to identify the record, instead of GUID` `code`
      - Used for clients that do not want to keep GUIDs consistent across environments
  - ### Add Data Migration Columns
    - `externalkey` `Unique identifier from original source system`
    - `externalsystem` `Original source system`
- ## Customisation
  - For SI-Product forms: Copy&Rename them! 
  - Customise the form as required, optionally:
    - rename it: {table name} - Main Form
    - Add/Enable 'Power App Grid Control' (via legacy customisation UI) -> enable coloured option-set statuses [MS link](https://learn.microsoft.com/en-us/power-apps/maker/model-driven-apps/the-power-apps-grid-control)
      - Colours
        - Orange/Amber: ``ffd175``
        - Green: ``8ed483``
        - Red: ``ff8c8c``
        - Grey: ``d1d1d1``
![2025-01-25_06-43-26_am_1737787471013_0.png](/.attachments/2025-01-25_06-43-26_am_1737787471013_0-0f7602fb-f594-446e-b54b-a8b576141245.png)

  - Customise the 'Active records' view - then use XRMToolbox View layout replicator to update all other views
    - column: Name, {relevant columns}, creation on, by, modified on, by, status reason, where relevant: status
      - 'Name' has to be the first column and it has to be set - better UX, allows easy opening as well as opening in a separate tab
  - Using timeline? - reduce selected activity types - preferably less than 10 for better performance
  - Add and icon: 16px .svg as a new webresource - https://thedynamicidentity.com/2021/12/30/how-to-add-icons-to-a-custom-table-in-dynamics-crm/
  - Add table to the MDA and, if required, edit the sitemap
  - Add/update security role
  - Optional steps:
    - Enable & customise the quick-create form
    - Add business rules
    - Add real-time workflows
    - Add flows (no a-sync workflows if possible)
    - Update relationship type (e.g. to parental)
    - add field mappings
- <a href="https://smartimpactuk.visualstudio.com/DevOps/_wiki/wikis/DevOps.wiki/3451/Additional-table-customisation-steps" target="_blank">Additional table customisation steps</a> 
- ## Admin
  - Create a 'Data migration' user story to track deployment of all reference data (and link user stories)
-