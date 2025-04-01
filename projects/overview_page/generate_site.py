import json
import os
import argparse
from datetime import datetime

def read_projects():
    with open('projects.json', 'r') as f:
        data = json.load(f)
        # Sort projects by date in descending order (newest first)
        data['projects'].sort(key=lambda x: x['date'], reverse=True)
        return data

def format_date(date_str):
    """Convert YYYY-MM to Month YYYY format"""
    date = datetime.strptime(date_str, '%Y-%m')
    return date.strftime('%B %Y')

def generate_html(dev_mode=True):
    projects_data = read_projects()
    
    # Collect all unique tags
    all_tags = set()
    for project in projects_data['projects']:
        all_tags.update(project['tags'])
    
    html = '''
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My Projects</title>
'''

    # Add GoatCounter tracking code if not in dev mode
    if not dev_mode:
        html += '''
    <!-- GoatCounter analytics -->
    <script data-goatcounter="https://YOUR_GOATCOUNTER_CODE.goatcounter.com/count"
            async src="//gc.zgo.at/count.js"></script>
'''

    html += '''
    <style>
        /* Reset and base styles */
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }

        /* Header styles */
        .header {
            text-align: center;
            margin-bottom: 40px;
        }

        .nav-links {
            display: flex;
            justify-content: center;
            gap: 20px;
            margin-top: 15px;
            flex-wrap: wrap;
        }

        .nav-link {
            color: #007bff;
            text-decoration: none;
            transition: all 0.2s ease;
            font-size: 0.95rem;
        }

        .nav-link:hover {
            color: #0056b3;
            text-decoration: underline;
        }

        /* Filter styles */
        .filters {
            margin-bottom: 30px;
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            justify-content: center;
        }

        .filter-btn {
            padding: 8px 16px;
            border: 1px solid #ddd;
            border-radius: 20px;
            background: white;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .filter-btn.active {
            background: #007bff;
            color: white;
            border-color: #007bff;
        }

        /* Project grid */
        .projects-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 30px;
        }

        /* Project card */
        .project-card {
            border: 1px solid #eee;
            border-radius: 8px;
            overflow: hidden;
        }

        .project-image {
            width: 100%;
            height: 200px;
            object-fit: cover;
        }

        .project-content {
            padding: 20px;
        }

        .project-title {
            font-size: 1.5rem;
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .feedback-icon {
            font-size: 1rem;
            color: #666;
            cursor: pointer;
            position: relative;
            transition: color 0.2s ease;
        }

        .feedback-icon:hover {
            color: #007bff;
        }

        .feedback-icon::after {
            content: "send me feedback about that";
            position: absolute;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 5px 10px;
            border-radius: 4px;
            font-size: 0.8rem;
            white-space: nowrap;
            visibility: hidden;
            opacity: 0;
            transition: opacity 0.3s, visibility 0.3s;
            z-index: 10;
            left: 50%;
            transform: translateX(-50%);
            bottom: 100%;
            margin-bottom: 5px;
        }

        .feedback-icon:hover::after {
            visibility: visible;
            opacity: 1;
        }

        /* Make tooltip position better for mobile */
        @media (max-width: 768px) {
            .feedback-icon::after {
                left: 0;
                transform: none;
                bottom: auto;
                top: 100%;
                margin-top: 5px;
                margin-bottom: 0;
            }
        }

        .project-date {
            font-size: 0.9rem;
            color: #666;
            margin-bottom: 10px;
        }

        .project-description {
            margin-bottom: 15px;
            color: #666;
        }

        .project-tags {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-bottom: 15px;
        }

        .project-tag {
            background: #f0f0f0;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 0.9rem;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .project-tag:hover {
            background: #e0e0e0;
        }

        .project-links {
            display: flex;
            gap: 10px;
        }

        .project-link {
            text-decoration: none;
            color: #007bff;
            font-size: 0.9rem;
            transition: all 0.2s ease;
        }

        .project-link:hover {
            color: #0056b3;
            text-decoration: underline;
        }

        .project-impact {
            margin: 15px 0;
            font-style: italic;
            color: #666;
        }

        /* Responsive adjustments */
        @media (max-width: 768px) {
            body {
                padding: 10px;
            }
            
            .projects-grid {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
'''

    html += f'''
<body>
    <div class="header">
        <h1>My Projects</h1>
        <div class="nav-links">
            <a href="https://lellep.xyz" class="nav-link">← Back to Main Page</a>
            <a href="https://blog.lellep.xyz" class="nav-link">Blog</a>
            <a href="https://linkedin.com/in/YOURLINKEDIN" class="nav-link">LinkedIn</a>
            <a href="mailto:blog.ma.lel@gmail.com?subject=Feedback%20on%20Projects" class="nav-link">Send Feedback</a>
        </div>
    </div>

    <div class="filters">
        <button class="filter-btn active" data-tag="all">All</button>
        {' '.join(f'<button class="filter-btn" data-tag="{tag}">{tag}</button>' for tag in sorted(all_tags))}
    </div>

    <div class="projects-grid">
    '''
    
    # Helper function to add ref parameter to URLs
    def add_ref(url):
        if url:
            separator = '&' if '?' in url else '?'
            return f"{url}{separator}ref=lellepXyzProjects"
        return None

    # Generate project cards
    for project in projects_data['projects']:
        is_hidden = project.get('hidden', False)
        html += f'''
        <div class="project-card" data-tags='{",".join(project["tags"])}' data-hidden='{str(is_hidden).lower()}'>
            <img class="project-image" src="{project['image']}" alt="{project['title']}">
            <div class="project-content">
                <h2 class="project-title">
                    {project['title']}
                    <a href="mailto:blog.ma.lel@gmail.com?subject=Feedback%20on%20{project['title']}" class="feedback-icon" aria-label="Send feedback about this project">✉</a>
                </h2>
                <div class="project-date">{format_date(project['date'])}</div>
                <p class="project-description">{project['description']}</p>
                <div class="project-tags">
                    {' '.join(f'<span class="project-tag" onclick="filterByTag({chr(39)}{tag}{chr(39)})">{tag}</span>' for tag in project['tags'])}
                </div>
                <p class="project-impact">{project['impact']}</p>
                <div class="project-links">
                    {f'<a href="{add_ref(project["demo_link"])}" class="project-link" target="_blank">Demo</a>' if project.get('demo_link') else ''}
                    {f'<a href="{add_ref(project["code_link"])}" class="project-link" target="_blank">Code</a>' if project.get('code_link') else ''}
                    {f'<a href="{add_ref(project["writeup_link"])}" class="project-link" target="_blank">Write-up</a>' if project.get('writeup_link') else ''}
                </div>
            </div>
        </div>
        '''

    html += '''
    </div>

    <script>
        document.addEventListener('DOMContentLoaded', () => {
            const filterButtons = document.querySelectorAll('.filter-btn');
            const projects = document.querySelectorAll('.project-card');
            
            // Check for URL parameter to show hidden projects
            const urlParams = new URLSearchParams(window.location.search);
            const showHidden = urlParams.get('making') === 'true';
            
            // Initially hide projects marked as hidden unless URL parameter is present
            projects.forEach(project => {
                if (project.getAttribute('data-hidden') === 'true' && !showHidden) {
                    project.style.display = 'none';
                }
            });

            // Function to filter projects by tag
            window.filterByTag = (selectedTag) => {
                // Update filter button UI
                filterButtons.forEach(btn => {
                    if (btn.getAttribute('data-tag') === selectedTag) {
                        btn.classList.add('active');
                    } else {
                        btn.classList.remove('active');
                    }
                });
                
                // Filter projects
                projects.forEach(project => {
                    // Skip hidden projects unless URL parameter is present
                    if (project.getAttribute('data-hidden') === 'true' && !showHidden) {
                        project.style.display = 'none';
                        return;
                    }
                    
                    const projectTags = project.getAttribute('data-tags').split(',');
                    project.style.display = projectTags.includes(selectedTag) ? 'block' : 'none';
                });
            };

            // Click handler for filter buttons
            filterButtons.forEach(button => {
                button.addEventListener('click', () => {
                    // Remove active class from all buttons
                    filterButtons.forEach(btn => btn.classList.remove('active'));
                    
                    // Add active class to clicked button
                    button.classList.add('active');
                    
                    const selectedTag = button.getAttribute('data-tag');
                    
                    projects.forEach(project => {
                        // Skip hidden projects unless URL parameter is present
                        if (project.getAttribute('data-hidden') === 'true' && !showHidden) {
                            project.style.display = 'none';
                            return;
                        }
                        
                        if (selectedTag === 'all') {
                            project.style.display = 'block';
                        } else {
                            const projectTags = project.getAttribute('data-tags').split(',');
                            project.style.display = projectTags.includes(selectedTag) ? 'block' : 'none';
                        }
                    });
                });
            });
            
            // Add a note if hidden projects are being shown
            if (showHidden) {
                const header = document.querySelector('.header');
                const hiddenNote = document.createElement('div');
                hiddenNote.style.backgroundColor = '#ffffd0';
                hiddenNote.style.padding = '10px';
                hiddenNote.style.borderRadius = '5px';
                hiddenNote.style.marginTop = '15px';
                hiddenNote.style.fontSize = '0.9rem';
                hiddenNote.innerHTML = '<strong>Note:</strong> You are viewing hidden projects that are not normally displayed.';
                header.appendChild(hiddenNote);
            }
        });
    </script>
</body>
</html>
    '''
    
    with open('index.html', 'w') as f:
        f.write(html)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Generate project portfolio website')
    parser.add_argument('--dev', action='store_true', help='Enable development mode (no analytics)')
    args = parser.parse_args()
    
    generate_html(dev_mode=args.dev)
