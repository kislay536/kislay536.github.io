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
          description: "This is a description of the page. You can modify it in &#39;_pages/cv.md&#39;. You can also change or remove the top pdf download button.",
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
            },},{id: "news-selected-for-google-summer-of-code-2025-with-the-free-and-open-source-silicon-foundation-working-on-the-project-metro-mpi",
          title: 'Selected for Google Summer of Code 2025 with the Free and Open Source...',
          description: "",
          section: "News",},{id: "news-our-paper-netlam-an-automated-llm-framework-to-generate-and-evaluate-stealthy-hardware-trojans-received-the-best-workshop-paper-award-at-the-6th-acns-workshop-on-artificial-intelligence-in-hardware-security-aihws-munich-2025",
          title: 'Our paper NETLAM: An Automated LLM Framework to Generate and Evaluate Stealthy Hardware...',
          description: "",
          section: "News",},{id: "news-received-an-internship-offer-from-nvidia-bangalore-for-a-hardware-role-summer-2026",
          title: 'Received an internship offer from NVIDIA Bangalore for a hardware role (Summer 2026)....',
          description: "",
          section: "News",},{id: "projects-metro-mpi-accelerating-verilog-system-verilog-simulations",
          title: 'Metro-MPI++: Accelerating Verilog/System Verilog Simulations',
          description: "A GSoC project to automatically partition and parallelize hardware simulations in Verilator using MPI.",
          section: "Projects",handler: () => {
              window.location.href = "/projects/Metro-MPI++/";
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
