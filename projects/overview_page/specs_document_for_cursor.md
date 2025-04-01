# 2025-03-18

help me to create a website to list my projects on. It is supposed to be generated from a JSON.

requirements for the project page:
- the page is supposed to look minimal but elegant, both on desktop and mobile
- mobile friendly
- each project will be given a tag, a title, a description, an image and maybe a code and demo link. i want the user to be able to filter those projects based on the tags.

input from me:
- a json with a list of dicts that describe each of the projects
- each dict has the following keys:
    - title
    - description
    - image
    - list of tags
    - date of project
    - text on impact of project
    - link to demo (optional)
    - link to code (optional)
    - link to write up (optional)

let's build the project with python and output a static website, ideally in one file.

# TODO: See here https://claude.ai/chat/af6f4498-41c6-458a-a816-ae32312c3a1f

# TODO: I thought of spreadsheet over json, but Cursor recommended to keep json - which I will do then.