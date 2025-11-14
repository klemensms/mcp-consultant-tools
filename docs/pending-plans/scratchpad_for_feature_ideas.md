

help me change the sound for when claude stops vs when it uses a tool


---


we need to define best practices for adding icon web resources so that the agent can do this. 

Any webresource should always be created in the '{CLIENT}WebResources' solution
Icons should be named 'Icon for {table name}' 
Everything that is not visible to the end-user in CRM should always be lowercase. I.e. display names and descriptions for column and tables should be written in plain english with proper lower and upper cases. 
Every table and every column also needs a description - the agent should suggest these to the user before creating columns but give the user a change to change them. 
datetime fields must be created as teimezone indepenent - the agent needs to ask if dateonly should be displayed or date and time
when creating global optionsets, then the values for the optionset should be updated to start with 0 and then increment (where 0 hsould be reserved for the default value if one exists) and then increment

these rules need to be added to the customisatoin mcp - is it possible to always provide these to the agent to begin with automatically so that this their default approach (but let user overwrite it lateR?)

ultrathink

---




Add documentation for most important consultant prompts:
Most important prompts: 

- Use the validate-dataverse-best-practices tool to check the "{CLIENT}Core" solution with publisher prefix "sic_" for columns created - optional: in the last 30 days. include all returned information, including a complete list of affected tables for each of the checks.


from that point of view: review the docs/documentation documents. these need to focus on non-technical users of the mcp server. 
therefore, the most important things to show them is: how to configure it - i.e. what config do I need to add to my mcp client (first place: vs code, then claude desktop)
and then what prompts/advanced tools are available - e.g. the ones like the validate-dataverse-best-practices that combine a lot of steps the agent would otherwise have to make individual calls for and might hence not always do the same way.
after that everything else incl tools the agaent can use can come later - but the user needs to know how to start using it and what features have been built specifically with them as end-users in mind.

ultrathink

---




check for sql createdon modifiedon - later