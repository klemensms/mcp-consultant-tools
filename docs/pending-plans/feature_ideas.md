
Most important prompts: 

Use the validate-dataverse-best-practices tool to check the "___AOP___Core" solution with publisher prefix "sic_" for columns created in the last 30 days. include all returned information, including a complete list of affected tables for each of the checks



significantly reduce the claude. md file - I am getting this error:
Large CLAUDE.md will impact performance (161.1k chars > 40.0k)
Reduce it to under 40k. 

then add a strong warning to the beginnign and end that it must remain within this limit. 

move any technical deatils specific a particular intgegration into a new {INTEGRSATION}_TECHNICAL.md document, for example anything related to the figma integration can go into a new FIGMA_TECHNICAL.md taht can live in docs/documentation. then link there from the claude.md file


---

when this was built, the main index file ballooned to iver 11000 lines of code and the claude.md file to over 150k characters. 
we need to makde sure that we do not get indidvidual files that reach anywhere near this. 
add strong guidance to the claude.md file to prevent this from happeneing

---

are there any cetnral files (i.e. not integration specific ones) that are very large? 
do. afull review

---


how can I test this via npx? last time we published it there and it broke everything. is there a way to prerelease a tool for internal testing or anyhting similar? what are the options here? just running it locally is not quite good enough. maybe we can release it to a "--package=@mcp-consultant-tools/powerplatform/pre-release", "mcp-pp" or something similar that regular users would not get if they just used the latest version? even if they got it on the latest version we could quickly unpublish it from there if it was broken. ultrathink - what are our options here?

----


help me change the sound for when claude stops vs when it uses a tool