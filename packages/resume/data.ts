export const resumeRoles = ["universal", "full-stack", "machine-learning", "devops", "game-dev", "ai-agent", "product-engineer"] as const;
export const resumeLanguages = ["en", "zh"] as const;
export type ResumeRole = (typeof resumeRoles)[number];
export type ResumeLanguage = (typeof resumeLanguages)[number];
export type Localized = Record<ResumeLanguage, string>;

export const updated = "2026-09-16";
export const roleLabels: Record<ResumeRole, Localized> = {
  universal: { en: "Universal", zh: "综合" },
  "full-stack": { en: "Full-Stack Dev", zh: "全栈开发" },
  "machine-learning": { en: "Machine Learning", zh: "机器学习" },
  devops: { en: "DevOps", zh: "开发运维" },
  "game-dev": { en: "Game Dev", zh: "游戏开发" },
  "ai-agent": { en: "AI Agent", zh: "AI 智能体" },
  "product-engineer": { en: "Product Engineer", zh: "产品工程师" },
};

export const labels: Record<ResumeLanguage, Record<string, string>> = {
  en: { role: "CV focus", language: "Language", skills: "Key Skills", education: "Education", experience: "Work Experience", projects: "Selected Work", languages: "Languages", updated: "Last updated", nationality: "Nationality: China", print: "Print", download: "Download PDF", award: "Award", more: "More projects" },
  zh: { role: "简历方向", language: "语言", skills: "核心技能", education: "教育经历", experience: "工作经历", projects: "精选项目", languages: "语言能力", updated: "更新日期", nationality: "国籍：中国", print: "打印", download: "下载 PDF", award: "奖项", more: "更多项目" },
};

export const profile = {
  name: { en: "Gong Jian", zh: "宫健" },
  otherName: { en: "宫健", zh: "Gong Jian" },
  email: "gongbaodd@outlook.com",
  location: { en: "Tallinn, Estonia", zh: "爱沙尼亚·塔林" },
  github: "https://github.com/gongbaodd",
  website: "https://www.growgen.xyz",
  linkedin: "https://www.linkedin.com/in/jian-gong-27762aa8/",
  languages: [
    { englishName: "Mandarin Chinese", nativeName: "普通话", code: "zh-CN", proficiency: { en: "Native", zh: "母语" } },
    { englishName: "English", nativeName: "English", code: "en", proficiency: { en: "C1", zh: "C1" } },
    { englishName: "Japanese", nativeName: "日本語", code: "ja", proficiency: { en: "Beginner", zh: "初级" } },
    { englishName: "Thai", nativeName: "ภาษาไทย", code: "th", proficiency: { en: "Spoken", zh: "口语" } },
    { englishName: "Estonian", nativeName: "eesti keel", code: "et", proficiency: { en: "A1", zh: "A1" } },
    { englishName: "Russian", nativeName: "русский", code: "ru", proficiency: { en: "A1", zh: "A1" } },
    { englishName: "German", nativeName: "Deutsch", code: "de", proficiency: { en: "A1", zh: "A1" } },
  ],
};

export interface ResumeEntry {
  name: Localized;
  detail: Localized;
  date?: Localized;
  image?: string;
  url?: string;
  tags?: string[];
  degree?: string;
  award?: Localized;
}

// Facts and links are shared by every CV. Edit translations here, then select
// their IDs in `variants` below. Keep claims aligned with the source CV.
export const education = {
  sut: { name: { en: "Shenyang University of Technology", zh: "沈阳工业大学" }, detail: { en: "Computer Science", zh: "计算机科学" }, date: { en: "2011–2015", zh: "2011–2015" }, degree: "BSc", image: "https://res.cloudinary.com/dmq8ipket/image/upload/v1778328777/STU_kinje0.jpg" },
  tlu: { name: { en: "Tallinn University", zh: "塔林大学" }, detail: { en: "Digital Learning Games", zh: "数字学习游戏" }, date: { en: "2024–2026", zh: "2024–2026" }, degree: "MSc", award: { en: "National Scholarship for International Students, Education and Youth Board of Estonia (2026)", zh: "爱沙尼亚教育与青年局国际学生国家奖学金（2026）" }, image: "https://res.cloudinary.com/dmq8ipket/image/upload/v1778330602/copy_of_copy_of_tlu_hvawhg_a86549_6afe2e.jpg" },
  bat: { name: { en: "Brandenburg University of Applied Sciences", zh: "勃兰登堡应用技术大学" }, detail: { en: "Interactive Environments", zh: "交互环境" }, date: { en: "Dec 2025", zh: "2025 年 12 月" }, image: "https://res.cloudinary.com/dmq8ipket/image/upload/v1778330088/BAT_ihgz7p.jpg" },
  ul: { name: { en: "Universidade Lusófona", zh: "卢索福纳大学" }, detail: { en: "Data Science Applied to Geographic Information Systems", zh: "应用于地理信息系统的数据科学" }, date: { en: "Jan 2026", zh: "2026 年 1 月" }, image: "https://res.cloudinary.com/dmq8ipket/image/upload/v1778330248/UniversidadeLusofona-logo_wxfo5o.jpg" },
} satisfies Record<string, ResumeEntry>;

export const experience = {
  lecturer: { name: { en: "Tallinn University", zh: "塔林大学" }, detail: { en: "Lectured the course ‘From Atom to Products – Developing Design Systems in Figma’.", zh: "讲授“从原子到产品：在 Figma 中开发设计系统”课程。" }, date: { en: "Jul 2026", zh: "2026 年 7 月" }, image: education.tlu.image, tags: ["Figma", "Design Systems"] },
  kickstart: { name: { en: "Kickstart Now OÜ", zh: "Kickstart Now OÜ" }, detail: { en: "Built the automated translation pipeline and programmed gameplay plus automation tests for an award-winning Unity game on Steam.", zh: "搭建自动化翻译流程，为获奖的 Steam 平台 Unity 游戏开发玩法与自动化测试。" }, date: { en: "2025–2026", zh: "2025–2026" }, image: "https://res.cloudinary.com/dmq8ipket/image/upload/v1778517285/header_xgzuqo.jpg", tags: ["Unity", "Localization", "Test Automation"] },
  aftership: { name: { en: "AfterShip.com", zh: "AfterShip.com" }, detail: { en: "Automated crawler mapping workflows, cutting manual effort by 20% of sprint story points; led end-to-end testing, raising coverage to 96%.", zh: "自动化爬虫映射流程，将人工工作量减少了相当于冲刺故事点数的 20%；主导端到端测试，将覆盖率提升至 96%。" }, date: { en: "2019–2021", zh: "2019–2021" }, image: "https://res.cloudinary.com/dmq8ipket/image/upload/v1778362981/AfterShip_sm_pb1k3l.webp", tags: ["Python", "React", "Node.js", "AWS", "Google K8S"] },
  trip: { name: { en: "Trip.com", zh: "携程 / 去哪儿" }, detail: { en: "Built a frontend monitoring system that caught 90% of client-side issues before backend log analysis; shipped checkout, withdrawal and bank-card features.", zh: "搭建前端监控系统，在分析后端日志之前发现 90% 的客户端问题；交付收银、提现与银行卡功能。" }, date: { en: "2015–2019", zh: "2015–2019" }, image: "https://res.cloudinary.com/dmq8ipket/image/upload/v1785759396/trip_yw7gaq.png", tags: ["React Native", "Node.js", "jQuery", "Grafana"] },
} satisfies Record<string, ResumeEntry>;

export const projects = {
  drone: { name: { en: "XR Drone Simulator", zh: "XR 无人机模拟器" }, detail: { en: "MSc thesis: drone simulation combining PID control with ML-Agents", zh: "硕士论文项目：结合 PID 控制与 ML-Agents 的无人机模拟" }, image: "https://res.cloudinary.com/dmq8ipket/image/upload/v1778359976/Screenshot_20260509_235020_ygfgdn.png", tags: ["Unity", "MRTK", "PID Control", "ML-Agents", "PyTorch"], url: "https://github.com/gongbaodd/xr-drone-thesis/blob/master/main.pdf" },
  grandpa: { name: { en: "Grandpa’s Bee Haven", zh: "爷爷的蜜蜂乐园" }, detail: { en: "Award-winning Unity game on Steam: gameplay, localization, automated tests", zh: "获奖的 Steam 平台 Unity 游戏：玩法、本地化与自动化测试" }, award: { en: "BEST GAMEPLAY, Estonian Game Dev Guild Awards 2026", zh: "最佳玩法奖，2026 爱沙尼亚游戏开发者公会奖" }, image: "https://res.cloudinary.com/dmq8ipket/image/upload/v1778358907/grandpa_hrnltl.jpg", tags: ["Unity", "Localization"], url: "https://store.steampowered.com/app/3209160/Grandpas_Bee_Haven/" },
  tetris: { name: { en: "Tetris AI", zh: "俄罗斯方块 AI" }, detail: { en: "PixiJS Tetris with minimax AI", zh: "基于极小化极大算法的 PixiJS 俄罗斯方块 AI" }, image: "https://res.cloudinary.com/dmq8ipket/image/upload/v1758702645/Screenshot_2025-09-24_112929_iaqeay.png", tags: ["PixiJS", "Minimax"], url: "https://www.growgen.xyz/fe/2025/09/09/tetris-ai" },
  missile: { name: { en: "3D Missile Command MMRPG", zh: "3D 导弹指挥大型多人角色扮演游戏" }, detail: { en: "Multiplayer game prototype with Colyseus server", zh: "使用 Colyseus 服务端的多人游戏原型" }, image: "https://res.cloudinary.com/dmq8ipket/image/upload/v1778365995/defender_instruction_erc481_j9xs7w.png", tags: ["BabylonJS", "Colyseus", "Node.js"], url: "https://www.growgen.xyz/plan/2025/10/08/remake-of-missile-command" },
  hearing: { name: { en: "Hearing Aid", zh: "助听器" }, detail: { en: "Microcontroller ML experiment with MFCC + CNN", zh: "基于 MFCC 与 CNN 的微控制器机器学习实验" }, image: "https://res.cloudinary.com/dmq8ipket/image/upload/v1778360397/hearing-aid.Auxz8chm_vscant.jpg", tags: ["Arduino", "Edge ML", "MFCC", "CNN"], url: "https://www.growgen.xyz/plan/2025/08/02/week-32-edge-impulse" },
  ninja: { name: { en: "Ninja Paws", zh: "Ninja Paws" }, detail: { en: "Unity game driven by behavior-tree AI", zh: "由行为树 AI 驱动的 Unity 游戏" }, image: "https://res.cloudinary.com/dmq8ipket/image/upload/v1757494717/Screenshot_2025-09-10_115254_xrklg6.png", tags: ["Unity", "Behavior Tree"], url: "https://www.growgen.xyz/lab/2025/07/04/ninja-paws" },
  tour: { name: { en: "Tallinn University XR Tour", zh: "塔林大学 XR 导览" }, detail: { en: "Interactive XR campus tour with 3D Gaussian splatting", zh: "结合 3D 高斯泼溅的交互式 XR 校园导览" }, image: "https://res.cloudinary.com/dmq8ipket/image/upload/v1757489746/1747656883140_hkuw9u.jpg", tags: ["BabylonJS", "3DGS"], url: "https://www.growgen.xyz/lab/2025/05/19/tlu-xr-tour" },
  kitchen: { name: { en: "Baltic Kitchen Kaos", zh: "波罗的海厨房大乱斗" }, detail: { en: "Interactive cooking game with MediaPipe", zh: "结合 MediaPipe 的交互式烹饪游戏" }, image: "https://res.cloudinary.com/dmq8ipket/image/upload/v1778361472/Screenshot_20260510_001659-1_gaycsj.png", tags: ["Unity", "ReactJS", "MediaPipe"], url: "https://www.growgen.xyz/lab/2025/05/20/baltic-kitchen-chaos" },
  wizard: { name: { en: "Enchanted Wizard", zh: "魔法巫师" }, detail: { en: "Game built with Godot", zh: "使用 Godot 开发的游戏" }, image: "https://img.itch.zone/aW1nLzE5ODg1ODg3LnBuZw==/347x500/AC%2BLS0.png", tags: ["Godot"], url: "https://www.growgen.xyz/lab/2025/02/15/enchanted-wizard" },
  aftership: { name: { en: "AfterShip.com", zh: "AfterShip.com" }, detail: { en: "Courier information, crawler and analytics dashboard", zh: "快递信息服务、爬虫及数据分析看板" }, image: experience.aftership.image, tags: ["Google K8S", "AWS", "Python", "ReactJS", "Node.js", "Shopify Polaris"], url: "https://www.aftership.com" },
  trip: { name: { en: "Trip.com", zh: "携程 / 去哪儿" }, detail: { en: "Cashier, withdrawal, bank cards, frontend analytics and test tools", zh: "收银、提现、银行卡管理、前端分析和测试工具" }, image: experience.trip.image, tags: ["jQuery", "React Native", "Node.js", "Grafana"], url: "https://www.qunar.com" },
  website: { name: { en: "GrowGen.xyz", zh: "GrowGen.xyz" }, detail: { en: "Personal blog and project lab built with Astro", zh: "使用 Astro 搭建的个人博客与项目实验室" }, image: "https://res.cloudinary.com/dmq8ipket/image/upload/v1786047419/Screenshot_20260806_231621_rjikuc.png", tags: ["Astro", "ReactJS", "Mantine"], url: "https://www.growgen.xyz/lab" },
} satisfies Record<string, ResumeEntry>;

export interface ResumeVariant {
  headline: Localized;
  summary: Localized;
  skills: { name: string; detail: Localized }[];
  education: (keyof typeof education)[];
  experience: (keyof typeof experience)[];
  projects: (keyof typeof projects)[];
}

const skill = (name: string, en: string, zh: string) => ({ name, detail: { en, zh } });
export const variants: Record<ResumeRole, ResumeVariant> = {
  universal: {
    headline: { en: "Full-Stack Web Developer | Game Programmer", zh: "全栈 Web 开发者｜游戏程序员" },
    summary: { en: "Full-stack web developer and game programmer with 6+ years of industry experience, including roles at Trip.com, AfterShip and Kickstart Now OÜ. Holds an MSc in Digital Learning Games, with thesis research on drone simulation using ML agents.", zh: "全栈 Web 开发者与游戏程序员，拥有 6 年以上行业经验，曾就职于携程、AfterShip 和 Kickstart Now OÜ。获数字学习游戏硕士学位，论文研究基于机器学习智能体的无人机仿真。" },
    skills: [skill("TypeScript & JavaScript", "Advanced; React and Vue", "熟练；React 与 Vue"), skill("Unity & Blender", "Intermediate; 2D and 3D games", "中级；2D 与 3D 游戏"), skill("Linux", "Intermediate; Alpine, Arch, Ubuntu and Debian", "中级；Alpine、Arch、Ubuntu、Debian"), skill("Python", "Intermediate; crawlers, SciPy and ML-Agents", "中级；爬虫、SciPy 与 ML-Agents"), skill("Engineering", "Git, agile, CI/CD, Docker, K8S, TDD, AWS, GCP and Cloudflare Workers", "Git、敏捷开发、CI/CD、Docker、K8S、TDD、AWS、GCP 和 Cloudflare Workers")],
    education: ["tlu", "ul", "bat", "sut"], experience: ["lecturer", "kickstart", "aftership", "trip"],
    projects: ["drone", "grandpa", "tetris", "missile", "hearing", "ninja", "tour", "kitchen", "wizard", "aftership", "trip", "website"],
  },
  "full-stack": {
    headline: { en: "Full-Stack Developer", zh: "全栈开发工程师" },
    summary: { en: "Full-stack developer with 6+ years of experience, including checkout, monitoring and analytics products at Trip.com and AfterShip. Works across jQuery, React Native, React, Node.js and Astro, with additional experience automating crawler and translation workflows.", zh: "全栈开发者，拥有 6 年以上经验，曾在携程与 AfterShip 开发收银、监控与数据分析产品。技术栈涵盖 jQuery、React Native、React、Node.js 和 Astro，并具备爬虫与翻译流程自动化经验。" },
    skills: [skill("TypeScript & JavaScript", "React, Vue, Node.js and Astro", "React、Vue、Node.js 与 Astro"), skill("Frontend", "Monitoring, analytics dashboards and design systems", "前端监控、数据看板与设计系统"), skill("Testing", "End-to-end testing and automation", "端到端测试与自动化"), skill("Cloud", "AWS, GCP, Docker, K8S and Cloudflare Workers", "AWS、GCP、Docker、K8S 与 Cloudflare Workers")],
    education: ["tlu", "ul", "bat", "sut"], experience: ["trip", "aftership", "lecturer", "kickstart"],
    projects: ["aftership", "trip", "website", "missile", "tour", "tetris", "kitchen", "grandpa", "drone"],
  },
  "machine-learning": {
    headline: { en: "Machine Learning & Interactive Systems Developer", zh: "机器学习与交互系统开发者" },
    summary: { en: "Developer focused on ML agents, game AI and edge ML. Projects span drone simulation with ML-Agents, minimax game AI and microcontroller experiments using MFCC and CNN. Holds an MSc in Digital Learning Games from Tallinn University.", zh: "专注机器学习智能体、游戏 AI 与边缘机器学习的开发者。项目涵盖基于 ML-Agents 的无人机仿真、极小化极大算法游戏 AI，以及使用 MFCC 与 CNN 的微控制器实验。获塔林大学数字学习游戏硕士学位。" },
    skills: [skill("Python", "SciPy, crawlers and ML-Agents", "SciPy、爬虫与 ML-Agents"), skill("Applied ML", "PyTorch, edge ML, MFCC and CNN", "PyTorch、边缘机器学习、MFCC 与 CNN"), skill("Simulation", "Unity, PID control and XR", "Unity、PID 控制与 XR"), skill("Data", "Analytics dashboards and geographic information systems", "数据分析看板与地理信息系统")],
    education: ["tlu", "ul", "bat", "sut"], experience: ["aftership", "lecturer", "kickstart", "trip"],
    projects: ["drone", "hearing", "tetris", "tour", "aftership", "website", "ninja", "kitchen", "trip"],
  },
  devops: {
    headline: { en: "DevOps & Automation Developer", zh: "开发运维与自动化工程师" },
    summary: { en: "Developer focused on automation and reliability, with production experience at Trip.com and AfterShip. Experience spans CI/CD, crawler and translation pipelines, Kubernetes on AWS and GCP, and end-to-end testing with 96% coverage.", zh: "专注自动化与可靠性的开发者，拥有携程与 AfterShip 的生产环境经验。工作涵盖 CI/CD、爬虫与翻译流水线、AWS 与 GCP 上的 Kubernetes，以及覆盖率达 96% 的端到端测试。" },
    skills: [skill("Cloud & containers", "AWS, GCP, Docker and Google K8S", "AWS、GCP、Docker 与 Google K8S"), skill("Automation", "CI/CD, translation pipelines and crawler workflows", "CI/CD、翻译流水线与爬虫工作流"), skill("Reliability", "End-to-end testing and frontend monitoring", "端到端测试与前端监控"), skill("Linux", "Alpine, Arch, Ubuntu and Debian", "Alpine、Arch、Ubuntu 与 Debian")],
    education: ["tlu", "ul", "bat", "sut"], experience: ["aftership", "trip", "kickstart", "lecturer"],
    projects: ["aftership", "trip", "website", "missile", "drone", "tour", "grandpa", "kitchen", "tetris"],
  },
  "game-dev": {
    headline: { en: "Game Developer & Programmer", zh: "游戏开发工程师" },
    summary: { en: "Game programmer experienced in Unity 2D and 3D development, including gameplay, behavior-tree AI and automated testing. Contributed to a Unity game released on Steam and holds an MSc in Digital Learning Games from Tallinn University.", zh: "具备 Unity 2D 与 3D 开发经验的游戏程序员，工作涵盖玩法、行为树 AI 与自动化测试。参与开发已在 Steam 发布的 Unity 游戏，获塔林大学数字学习游戏硕士学位。" },
    skills: [skill("Unity & Blender", "2D and 3D game development", "2D 与 3D 游戏开发"), skill("Game systems", "Behavior trees, gameplay and automated tests", "行为树、游戏玩法与自动化测试"), skill("Web games", "BabylonJS, PixiJS and Colyseus", "BabylonJS、PixiJS 与 Colyseus"), skill("XR & ML", "MRTK, ML-Agents and MediaPipe", "MRTK、ML-Agents 与 MediaPipe")],
    education: ["tlu", "ul", "bat", "sut"], experience: ["kickstart", "lecturer", "aftership", "trip"],
    projects: ["grandpa", "drone", "ninja", "kitchen", "wizard", "missile", "tetris", "tour", "website"],
  },
  "ai-agent": {
    headline: { en: "AI Agent Developer", zh: "AI 智能体开发工程师" },
    summary: { en: "Developer building AI agents and automation, with production Python experience at AfterShip. Work spans ML-Agents simulations, minimax and behavior-tree game AI, edge-ML experiments, and production crawler and translation pipelines.", zh: "专注 AI 智能体与自动化的开发者，拥有 AfterShip 的生产级 Python 开发经验。项目涵盖 ML-Agents 仿真、极小化极大算法与行为树游戏 AI、边缘机器学习实验，以及生产级爬虫与翻译流水线。" },
    skills: [skill("Python", "Crawlers, SciPy and ML-Agents", "爬虫、SciPy 与 ML-Agents"), skill("Agent systems", "ML-Agents, minimax, behavior trees and edge ML", "ML-Agents、极小化极大算法、行为树与边缘机器学习"), skill("Automation", "Translation pipelines, crawler workflows and end-to-end testing", "翻译流水线、爬虫工作流与端到端测试"), skill("Web & Cloud", "React, Node.js, Docker, K8S and Cloudflare Workers", "React、Node.js、Docker、K8S 与 Cloudflare Workers")],
    education: ["tlu", "ul", "bat", "sut"], experience: ["kickstart", "aftership", "trip", "lecturer"],
    projects: ["drone", "tetris", "hearing", "ninja", "missile", "grandpa", "aftership", "trip", "kitchen"],
  },
  "product-engineer": {
    headline: { en: "Product Engineer", zh: "产品工程师" },
    summary: { en: "Product-focused engineer with 6+ years of experience across e-commerce, SaaS and games. Delivered checkout flows, monitoring systems and analytics dashboards at Trip.com and AfterShip, and contributed to a Unity game released on Steam.", zh: "以产品为导向的工程师，拥有横跨电商、SaaS 与游戏领域的 6 年以上经验。曾在携程与 AfterShip 交付收银流程、监控系统与数据分析看板，并参与开发已在 Steam 发布的 Unity 游戏。" },
    skills: [skill("Product surfaces", "Checkout, payments, monitoring and analytics dashboards", "收银支付、前端监控与数据分析看板"), skill("Full-stack", "React, Vue, Node.js and Astro", "React、Vue、Node.js 与 Astro"), skill("Quality", "End-to-end testing and automation", "端到端测试与自动化"), skill("Design & delivery", "Design systems, agile development and CI/CD", "设计系统、敏捷开发与 CI/CD")],
    education: ["tlu", "ul", "bat", "sut"], experience: ["trip", "aftership", "kickstart", "lecturer"],
    projects: ["trip", "aftership", "grandpa", "website", "missile", "tour", "kitchen", "tetris", "drone"],
  },
};

export function resumePath(role: ResumeRole, language: ResumeLanguage) {
  return role === "universal" && language === "en" ? "/resume" : `/resume/${role}/${language}`;
}

export function pdfPath(role: ResumeRole, language: ResumeLanguage) {
  return `/resume/pdfs/jian-gong-${role}-${language}.pdf`;
}
