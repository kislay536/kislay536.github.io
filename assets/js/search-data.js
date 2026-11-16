// get the ninja-keys element
const ninja = document.querySelector('ninja-keys');

// add the home and posts menu items
ninja.data = [{
    id: "nav-about",
    title: "About",
    section: "Navigation",
    handler: () => {
      window.location.href = "/";
    },
  },{id: "nav-blog",
          title: "blog",
          description: "",
          section: "Navigation",
          handler: () => {
            window.location.href = "/blog/";
          },
        },{id: "nav-publications",
          title: "publications",
          description: "My publications by categories in reversed chronological order",
          section: "Navigation",
          handler: () => {
            window.location.href = "/publications/";
          },
        },{id: "nav-projects",
          title: "projects",
          description: "My Projects",
          section: "Navigation",
          handler: () => {
            window.location.href = "/projects/";
          },
        },{id: "nav-cv",
          title: "cv",
          description: "",
          section: "Navigation",
          handler: () => {
            window.location.href = "/cv/";
          },
        },{id: "dropdown-bookshelf",
              title: "bookshelf",
              description: "",
              section: "Dropdown",
              handler: () => {
                window.location.href = "/books/";
              },
            },{id: "dropdown-blog",
              title: "blog",
              description: "",
              section: "Dropdown",
              handler: () => {
                window.location.href = "/blog/";
              },
            },{id: "post-metro-mpi-accelerating-verilog-system-verilog-simulations-kislay-arya",
        
          title: 'Metro-MPI++: Accelerating Verilog/System Verilog Simulations | Kislay Arya <svg width="1.2rem" height="1.2rem" top=".5rem" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><path d="M17 13.5v6H5v-12h6m3-3h6v6m0-6-9 9" class="icon_svg-stroke" stroke="#999" stroke-width="1.5" fill="none" fill-rule="evenodd" stroke-linecap="round" stroke-linejoin="round"></path></svg>',
        
        description: "A GSoC project to automatically partition and parallelize hardware simulations in Verilator using MPI.",
        section: "Posts",
        handler: () => {
          
            window.open("https://kislay536.github.io/projects/Metro-MPI++/", "_blank");
          
        },
      },{id: "books-white-nights",
          title: 'White Nights',
          description: "",
          section: "Books",handler: () => {
              window.location.href = "/books/white_nights/";
            },},{id: "news-our-paper-netlam-an-automated-llm-framework-to-generate-and-evaluate-stealthy-hardware-trojans-received-the-best-workshop-paper-award-at-the-6th-acns-workshop-on-artificial-intelligence-in-hardware-security-aihws-munich-2025",
          title: 'Our paper NETLAM: An Automated LLM Framework to Generate and Evaluate Stealthy Hardware...',
          description: "",
          section: "News",},{id: "news-completed-google-summer-of-code-2025-with-the-free-and-open-source-silicon-foundation-working-on-the-project-metro-mpi",
          title: 'Completed Google Summer of Code 2025 with the Free and Open Source Silicon...',
          description: "",
          section: "News",},{id: "news-completed-my-internship-at-nvidia-bangalore-working-on-formal-verification-and-received-a-return-offer",
          title: 'Completed my internship at NVIDIA Bangalore, working on formal verification, and received a...',
          description: "",
          section: "News",},{id: "news-joined-the-max-planck-institute-for-software-systems-mpi-sws-as-a-visiting-scholar-saarbrücken",
          title: 'Joined the Max Planck Institute for Software Systems (MPI-SWS) as a visiting scholar,...',
          description: "",
          section: "News",},{id: "projects-metro-mpi-accelerating-verilog-system-verilog-simulations",
          title: 'Metro-MPI++: Accelerating Verilog/System Verilog Simulations',
          description: "A GSoC project to automatically partition and parallelize hardware simulations in Verilator using MPI.",
          section: "Projects",handler: () => {
              window.location.href = "/projects/Metro-MPI++/";
            },},{id: "projects-pumsolve-solver-aided-discovery-of-dram-resident-compute-kernels",
          title: 'PuMSolve: Solver-Aided Discovery of DRAM-Resident Compute Kernels',
          description: "A Z3-based framework that synthesizes in-DRAM programs for a target operation, or proves that none exists.",
          section: "Projects",handler: () => {
              window.location.href = "/projects/PuMSolve/";
            },},{id: "projects-world-action-models",
          title: 'World Action Models',
          description: "Interactive explainers of world-action model architectures (password protected).",
          section: "Projects",handler: () => {
              window.location.href = "/projects/world-action-models/";
            },},{
        id: 'social-email',
        title: 'email',
        section: 'Socials',
        handler: () => {
          window.open("mailto:%6B%69%73%6C%61%79%61%72%79%61%35%33%36@%67%6D%61%69%6C.%63%6F%6D", "_blank");
        },
      },{
        id: 'social-github',
        title: 'GitHub',
        section: 'Socials',
        handler: () => {
          window.open("https://github.com/kislay536", "_blank");
        },
      },{
        id: 'social-linkedin',
        title: 'LinkedIn',
        section: 'Socials',
        handler: () => {
          window.open("https://www.linkedin.com/in/kislay-arya-154492254", "_blank");
        },
      },{
        id: 'social-orcid',
        title: 'ORCID',
        section: 'Socials',
        handler: () => {
          window.open("https://orcid.org/0009-0000-2305-5424", "_blank");
        },
      },{
        id: 'social-openreview_url',
        title: 'Openreview_url',
        section: 'Socials',
        handler: () => {
          window.open("", "_blank");
        },
      },{
        id: 'social-scholar',
        title: 'Google Scholar',
        section: 'Socials',
        handler: () => {
          window.open("https://scholar.google.com/citations?user=0bqkP_8AAAAJ", "_blank");
        },
      },{
      id: 'light-theme',
      title: 'Change theme to light',
      description: 'Change the theme of the site to Light',
      section: 'Theme',
      handler: () => {
        setThemeSetting("light");
      },
    },
    {
      id: 'dark-theme',
      title: 'Change theme to dark',
      description: 'Change the theme of the site to Dark',
      section: 'Theme',
      handler: () => {
        setThemeSetting("dark");
      },
    },
    {
      id: 'system-theme',
      title: 'Use system default theme',
      description: 'Change the theme of the site to System Default',
      section: 'Theme',
      handler: () => {
        setThemeSetting("system");
      },
    },];
