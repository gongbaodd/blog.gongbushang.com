export const resumeRoles = ["universal", "full-stack", "machine-learning", "devops", "game-dev", "ai-agent", "product-engineer", "qa-tester"] as const;
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
  "qa-tester": { en: "QA Tester", zh: "测试工程师" },
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
    { englishName: "Thai", nativeName: "ภาษาไทย", code: "th", proficiency: { en: "Speaking", zh: "口语" } },
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
  // Source: /fe/2026/07/24/figma and /fe/2026/07/31/figma-2
  lecturer: { name: { en: "Tallinn University", zh: "塔林大学" }, detail: { en: "Taught Figma design systems at Tallinn University, guiding students through design tokens, reusable components, prototyping and developer handoff.", zh: "在塔林大学讲授 Figma 设计系统，指导学生构建设计令牌与可复用组件，完成原型设计和开发交付。" }, date: { en: "Jul 2026", zh: "2026 年 7 月" }, image: education.tlu.image, tags: ["Figma", "Design Systems"] },
  // Source: /tech/2026/02/23/unity-localization and /fe/2026/08/21/bdd
  kickstart: { name: { en: "Kickstart Now OÜ", zh: "Kickstart Now OÜ" }, detail: { en: "Developed gameplay and automated localization for a Steam release; built Python/Poco/pytest-bdd tests across languages and resolutions.", zh: "为 Steam 游戏开发玩法与本地化自动化流程；使用 Python、Poco 和 pytest-bdd 构建跨语言、跨分辨率测试。" }, date: { en: "2025–2026", zh: "2025–2026" }, image: "https://res.cloudinary.com/dmq8ipket/image/upload/v1778517285/header_xgzuqo.jpg", tags: ["Unity", "Localization", "Test Automation"] },
  // Source: Existing CV metrics: packages/resume/components/Job.tsx
  aftership: { name: { en: "AfterShip.com", zh: "AfterShip.com" }, detail: { en: "Automated crawler mapping, eliminating manual work equivalent to 20% of sprint story points; led end-to-end testing to reach 96% coverage.", zh: "通过爬虫映射自动化，省去相当于冲刺故事点数 20% 的人工工作；主导端到端测试，将覆盖率提升至 96%。" }, date: { en: "2019–2021", zh: "2019–2021" }, image: "https://res.cloudinary.com/dmq8ipket/image/upload/v1778362981/AfterShip_sm_pb1k3l.webp", tags: ["Python", "React", "Node.js", "AWS", "Google K8S"] },
  // Source: Existing CV metrics: packages/resume/components/Job.tsx
  trip: { name: { en: "Trip.com", zh: "携程 / 去哪儿" }, detail: { en: "Delivered checkout, withdrawal and bank-card features; built frontend monitoring that detected 90% of client-side issues before backend log analysis.", zh: "交付收银、提现与银行卡功能；搭建前端监控系统，在后端日志分析前发现 90% 的客户端问题。" }, date: { en: "2015–2019", zh: "2015–2019" }, image: "https://res.cloudinary.com/dmq8ipket/image/upload/v1785759396/trip_yw7gaq.png", tags: ["React Native", "Node.js", "jQuery", "Grafana"] },
} satisfies Record<string, ResumeEntry>;

export const projects = {
  // Source: /tech/2026/06/06/xr-drone-sim; thesis linked below
  drone: { name: { en: "XR Drone Simulator", zh: "XR 无人机模拟器" }, detail: { en: "Built a Unity XR drone simulator with PID control and ML-Agents for my MSc thesis; published on SideQuest.", zh: "为硕士论文开发结合 PID 控制与 ML-Agents 的 Unity XR 无人机模拟器，并发布至 SideQuest。" }, image: "https://res.cloudinary.com/dmq8ipket/image/upload/v1778359976/Screenshot_20260509_235020_ygfgdn.png", tags: ["Unity", "MRTK", "PID Control", "ML-Agents", "PyTorch"], url: "https://github.com/gongbaodd/xr-drone-thesis/blob/master/main.pdf" },
  // Source: /fe/2026/08/21/bdd; Steam page below confirms release and award
  grandpa: { name: { en: "Grandpa’s Bee Haven", zh: "爷爷的蜜蜂乐园" }, detail: { en: "Developed gameplay, localization and automated tests for an award-winning Unity game released on Steam.", zh: "为已在 Steam 发布并获奖的 Unity 游戏开发玩法、本地化与自动化测试。" }, award: { en: "BEST GAMEPLAY, Estonian Game Dev Guild Awards 2026", zh: "最佳玩法奖，2026 爱沙尼亚游戏开发者公会奖" }, image: "https://res.cloudinary.com/dmq8ipket/image/upload/v1778358907/grandpa_hrnltl.jpg", tags: ["Unity", "Localization"], url: "https://store.steampowered.com/app/3209160/Grandpas_Bee_Haven/" },
  // Source: /fe/2025/09/09/tetris-ai
  tetris: { name: { en: "Tetris AI", zh: "俄罗斯方块 AI" }, detail: { en: "Modernized Pixtris to PixiJS 8 and TypeScript, adding a minimax opponent for competitive play.", zh: "将 Pixtris 升级至 PixiJS 8 与 TypeScript，并加入用于对战的极小化极大算法对手。" }, image: "https://res.cloudinary.com/dmq8ipket/image/upload/v1758702645/Screenshot_2025-09-24_112929_iaqeay.png", tags: ["PixiJS", "Minimax"], url: "https://www.growgen.xyz/fe/2025/09/09/tetris-ai" },
  // Source: /plan/2025/10/31/week-45-colyseus follows the initial Firebase prototype
  missile: { name: { en: "Missile Command: 3D Multiplayer", zh: "3D 导弹指挥：多人对战" }, detail: { en: "Built a 1v1 Babylon.js game with real-time multiplayer state synchronization through a Colyseus server.", zh: "使用 Babylon.js 开发 1v1 对战游戏，通过 Colyseus 服务端实时同步多人游戏状态。" }, image: "https://res.cloudinary.com/dmq8ipket/image/upload/v1778365995/defender_instruction_erc481_j9xs7w.png", tags: ["BabylonJS", "Colyseus", "Node.js"], url: "https://www.growgen.xyz/plan/2025/10/08/remake-of-missile-command" },
  // Source: /plan/2025/08/02/week-32-edge-impulse; collaborative prototype, not a medical product
  hearing: { name: { en: "Sound Alert Prototype", zh: "声音提醒原型" }, detail: { en: "Trained an MFCC/CNN sound classifier for a tactile-alert prototype, switching to ESP32 to overcome Arduino memory limits.", zh: "为触觉提醒原型训练 MFCC/CNN 声音分类模型，并改用 ESP32 解决 Arduino 内存不足的问题。" }, image: "https://res.cloudinary.com/dmq8ipket/image/upload/v1778360397/hearing-aid.Auxz8chm_vscant.jpg", tags: ["ESP32", "Edge ML", "MFCC", "CNN"], url: "https://www.growgen.xyz/plan/2025/08/02/week-32-edge-impulse" },
  // Source: /fe/2025/07/04/ninja-paws
  ninja: { name: { en: "Ninja Paws", zh: "Ninja Paws" }, detail: { en: "Implemented fruit-slicing and dungeon-combat scenes in a Unity game built with a classmate.", zh: "与同学合作开发 Unity 游戏，负责水果切割与地牢战斗两个场景。" }, image: "https://res.cloudinary.com/dmq8ipket/image/upload/v1757494717/Screenshot_2025-09-10_115254_xrklg6.png", tags: ["Unity", "Behavior Tree"], url: "https://www.growgen.xyz/lab/2025/07/04/ninja-paws" },
  // Source: /fe/2025/05/19/tlu-xr-tour
  tour: { name: { en: "Tallinn University XR Tour", zh: "塔林大学 XR 导览" }, detail: { en: "Built a browser-based campus tour with captured 3D scenes and XR teleportation; tested on Quest 3.", zh: "利用采集的三维场景与 XR 传送功能开发浏览器校园导览，并在 Quest 3 上测试。" }, image: "https://res.cloudinary.com/dmq8ipket/image/upload/v1757489746/1747656883140_hkuw9u.jpg", tags: ["BabylonJS", "3DGS"], url: "https://www.growgen.xyz/lab/2025/05/19/tlu-xr-tour" },
  // Source: /fe/2025/05/20/baltic-kitchen-chaos; teammates handled narrative, sound and design
  kitchen: { name: { en: "Baltic Kitchen Kaos", zh: "波罗的海厨房大乱斗" }, detail: { en: "Programmed cooking gameplay and experimental hand tracking, bridging browser-based MediaPipe to Unity through JavaScript.", zh: "负责烹饪玩法编程，并通过 JavaScript 将浏览器端 MediaPipe 接入 Unity，制作实验性手势交互版本。" }, image: "https://res.cloudinary.com/dmq8ipket/image/upload/v1778361472/Screenshot_20260510_001659-1_gaycsj.png", tags: ["Unity", "ReactJS", "MediaPipe"], url: "https://www.growgen.xyz/lab/2025/05/20/baltic-kitchen-chaos" },
  // Source: /fe/2025/02/15/enchanted-wizard
  wizard: { name: { en: "Enchanted Wizard", zh: "魔法巫师" }, detail: { en: "Built and published a Godot XR shooting game for the Godot XR Game Jam.", zh: "为 Godot XR Game Jam 开发并发布一款 Godot XR 射击游戏。" }, image: "https://img.itch.zone/aW1nLzE5ODg1ODg3LnBuZw==/347x500/AC%2BLS0.png", tags: ["Godot"], url: "https://www.growgen.xyz/lab/2025/02/15/enchanted-wizard" },
  // Source: Existing project scope: packages/resume/components/Work.tsx
  aftership: { name: { en: "AfterShip.com", zh: "AfterShip.com" }, detail: { en: "Developed courier-data workflows, crawlers and analytics interfaces for AfterShip, connecting data collection with reporting.", zh: "为 AfterShip 开发快递数据流程、爬虫与分析界面，连接数据采集与报表展示。" }, image: experience.aftership.image, tags: ["Google K8S", "AWS", "Python", "ReactJS", "Node.js", "Shopify Polaris"], url: "https://www.aftership.com" },
  // Source: Existing project scope: packages/resume/components/Work.tsx and Job.tsx
  trip: { name: { en: "Trip.com", zh: "携程 / 去哪儿" }, detail: { en: "Built checkout, withdrawal and bank-card features, alongside frontend monitoring and tools for testing payment flows.", zh: "开发收银、提现与银行卡功能，并搭建前端监控及支付流程测试工具。" }, image: experience.trip.image, tags: ["jQuery", "React Native", "Node.js", "Grafana"], url: "https://www.qunar.com" },
  // Source: /plan/2025/10/31/week-45-colyseus documents the historical SVG optimization
  website: { name: { en: "GrowGen.xyz", zh: "GrowGen.xyz" }, detail: { en: "Built an Astro blog and project lab; reduced SVG previews from up to 1 MB to 10–100 KB.", zh: "搭建 Astro 博客与项目实验室，将原先最大 1 MB 的 SVG 预览优化至 10–100 KB。" }, image: "https://res.cloudinary.com/dmq8ipket/image/upload/v1786047419/Screenshot_20260806_231621_rjikuc.png", tags: ["Astro", "ReactJS", "Mantine"], url: "https://www.growgen.xyz/lab" },
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
// Summaries draw on the experience/project evidence above; metrics retain their original scope.
export const variants: Record<ResumeRole, ResumeVariant> = {
  universal: {
    headline: { en: "Full-Stack Web Developer | Game Programmer", zh: "全栈 Web 开发者｜游戏程序员" },
    summary: { en: "Full-stack engineer and game programmer with 6+ years of industry experience, delivering checkout, monitoring and analytics products at Trip.com and AfterShip. Contributed to an award-winning Steam game and published an XR drone simulator developed for an MSc thesis.", zh: "全栈工程师与游戏程序员，拥有 6 年以上行业经验，曾在携程与 AfterShip 交付收银、监控及数据分析产品。参与开发获奖的 Steam 游戏，并发布了为硕士论文制作的 XR 无人机模拟器。" },
    skills: [skill("TypeScript & JavaScript", "Advanced; React and Vue", "熟练；React 与 Vue"), skill("Unity & Blender", "Intermediate; 2D and 3D games", "中级；2D 与 3D 游戏"), skill("Linux", "Intermediate; Alpine, Arch, Ubuntu and Debian", "中级；Alpine、Arch、Ubuntu、Debian"), skill("Python", "Intermediate; crawlers, SciPy and ML-Agents", "中级；爬虫、SciPy 与 ML-Agents"), skill("Engineering", "Git, agile, CI/CD, Docker, K8S, TDD, AWS, GCP and Cloudflare Workers", "Git、敏捷开发、CI/CD、Docker、K8S、TDD、AWS、GCP 和 Cloudflare Workers")],
    education: ["tlu", "ul", "bat", "sut"], experience: ["lecturer", "kickstart", "aftership", "trip"],
    projects: ["drone", "grandpa", "tetris", "hearing", "tour", "kitchen", "aftership", "trip", "website"],
  },
  "full-stack": {
    headline: { en: "Full-Stack Developer", zh: "全栈开发工程师" },
    summary: { en: "Full-stack developer with 6+ years of experience delivering checkout flows, monitoring systems and analytics interfaces at Trip.com and AfterShip. Combines frontend delivery with crawler automation and end-to-end testing, including work that brought test coverage to 96%.", zh: "全栈开发者，拥有 6 年以上经验，曾在携程与 AfterShip 交付收银流程、监控系统及数据分析界面。兼具前端交付、爬虫自动化与端到端测试经验，曾推动测试覆盖率达到 96%。" },
    skills: [skill("TypeScript & JavaScript", "React, Vue, Node.js and Astro", "React、Vue、Node.js 与 Astro"), skill("Frontend", "Monitoring, analytics dashboards and design systems", "前端监控、数据看板与设计系统"), skill("Testing", "End-to-end testing and automation", "端到端测试与自动化"), skill("Cloud", "AWS, GCP, Docker, K8S and Cloudflare Workers", "AWS、GCP、Docker、K8S 与 Cloudflare Workers")],
    education: ["tlu", "ul", "bat", "sut"], experience: ["trip", "aftership", "lecturer", "kickstart"],
    projects: ["aftership", "trip", "website", "missile", "tour", "tetris", "kitchen", "grandpa", "drone"],
  },
  "machine-learning": {
    headline: { en: "Machine Learning & Interactive Systems Developer", zh: "机器学习与交互系统开发者" },
    summary: { en: "Developer applying machine learning to simulation and interactive systems, backed by an MSc in Digital Learning Games. Built a drone simulator using ML-Agents, implemented minimax game AI and trained an embedded sound classifier for an experimental tactile-alert device.", zh: "将机器学习应用于仿真与交互系统的开发者，拥有数字学习游戏硕士学位。开发了基于 ML-Agents 的无人机模拟器，实现极小化极大算法游戏 AI，并为实验性触觉提醒设备训练嵌入式声音分类模型。" },
    skills: [skill("Python", "SciPy, crawlers and ML-Agents", "SciPy、爬虫与 ML-Agents"), skill("Applied ML", "PyTorch, edge ML, MFCC and CNN", "PyTorch、边缘机器学习、MFCC 与 CNN"), skill("Simulation", "Unity, PID control and XR", "Unity、PID 控制与 XR"), skill("Data", "Analytics dashboards and geographic information systems", "数据分析看板与地理信息系统")],
    education: ["tlu", "ul", "bat", "sut"], experience: ["aftership", "lecturer", "kickstart", "trip"],
    projects: ["drone", "hearing", "tetris", "tour", "aftership", "website", "ninja", "kitchen", "trip"],
  },
  devops: {
    headline: { en: "DevOps & Automation Developer", zh: "开发运维与自动化工程师" },
    summary: { en: "Automation-focused developer with production experience at Trip.com and AfterShip across CI/CD, crawler workflows and end-to-end testing. Automated crawler mapping to remove manual work equivalent to 20% of sprint story points and led testing that reached 96% coverage.", zh: "专注自动化的开发者，在携程与 AfterShip 积累了 CI/CD、爬虫流程及端到端测试的生产环境经验。通过爬虫映射自动化省去相当于冲刺故事点数 20% 的人工工作，并主导测试工作，将覆盖率提升至 96%。" },
    skills: [skill("Cloud & containers", "AWS, GCP, Docker and Google K8S", "AWS、GCP、Docker 与 Google K8S"), skill("Automation", "CI/CD, translation pipelines and crawler workflows", "CI/CD、翻译流水线与爬虫工作流"), skill("Reliability", "End-to-end testing and frontend monitoring", "端到端测试与前端监控"), skill("Linux", "Alpine, Arch, Ubuntu and Debian", "Alpine、Arch、Ubuntu 与 Debian")],
    education: ["tlu", "ul", "bat", "sut"], experience: ["aftership", "trip", "kickstart", "lecturer"],
    projects: ["aftership", "trip", "website", "missile", "drone", "tour", "grandpa", "kitchen", "tetris"],
  },
  "game-dev": {
    headline: { en: "Game Developer & Programmer", zh: "游戏开发工程师" },
    summary: { en: "Game programmer who contributed gameplay, localization and automated testing to an award-winning Unity game released on Steam. Holds an MSc in Digital Learning Games, with projects spanning a published XR drone simulator, multiplayer browser games and experimental hand-tracking interactions.", zh: "游戏程序员，为已在 Steam 发布并获奖的 Unity 游戏开发玩法、本地化与自动化测试。拥有数字学习游戏硕士学位，项目涵盖已发布的 XR 无人机模拟器、浏览器多人游戏及实验性手势交互。" },
    skills: [skill("Unity & Blender", "2D and 3D game development", "2D 与 3D 游戏开发"), skill("Game systems", "Behavior trees, gameplay and automated tests", "行为树、游戏玩法与自动化测试"), skill("Web games", "BabylonJS, PixiJS and Colyseus", "BabylonJS、PixiJS 与 Colyseus"), skill("XR & ML", "MRTK, ML-Agents and MediaPipe", "MRTK、ML-Agents 与 MediaPipe")],
    education: ["tlu", "ul", "bat", "sut"], experience: ["kickstart", "lecturer", "aftership", "trip"],
    projects: ["grandpa", "drone", "ninja", "kitchen", "wizard", "missile", "tetris", "tour", "website"],
  },
  "ai-agent": {
    headline: { en: "AI Agent Developer", zh: "AI 智能体开发工程师" },
    summary: { en: "Developer building simulation agents, game decision-making systems and automation, with production Python experience at AfterShip. Projects combine ML-Agents, minimax search and behavior trees with hands-on work on crawler workflows, translation pipelines and automated testing for a released Unity game.", zh: "专注仿真智能体、游戏决策系统与自动化的开发者，拥有 AfterShip 的生产级 Python 开发经验。项目涵盖 ML-Agents、极小化极大搜索及行为树，并具备爬虫流程、翻译流水线和已发布 Unity 游戏自动化测试的实践经验。" },
    skills: [skill("Python", "Crawlers, SciPy and ML-Agents", "爬虫、SciPy 与 ML-Agents"), skill("Agent systems", "ML-Agents, minimax, behavior trees and edge ML", "ML-Agents、极小化极大算法、行为树与边缘机器学习"), skill("Automation", "Translation pipelines, crawler workflows and end-to-end testing", "翻译流水线、爬虫工作流与端到端测试"), skill("Web & Cloud", "React, Node.js, Docker, K8S and Cloudflare Workers", "React、Node.js、Docker、K8S 与 Cloudflare Workers")],
    education: ["tlu", "ul", "bat", "sut"], experience: ["kickstart", "aftership", "trip", "lecturer"],
    projects: ["drone", "tetris", "hearing", "ninja", "missile", "grandpa", "aftership", "trip", "kitchen"],
  },
  "product-engineer": {
    headline: { en: "Product Engineer", zh: "产品工程师" },
    summary: { en: "Product engineer with 6+ years of experience delivering payment flows, monitoring and analytics products at Trip.com and AfterShip. Contributed to a released Steam game and taught Figma design systems, connecting implementation with reusable components, prototyping and developer handoff.", zh: "产品工程师，拥有 6 年以上经验，曾在携程与 AfterShip 交付支付流程、监控及数据分析产品。参与开发已发布的 Steam 游戏，并讲授 Figma 设计系统，将工程实现与可复用组件、原型设计及开发交付相结合。" },
    skills: [skill("Product surfaces", "Checkout, payments, monitoring and analytics dashboards", "收银支付、前端监控与数据分析看板"), skill("Full-stack", "React, Vue, Node.js and Astro", "React、Vue、Node.js 与 Astro"), skill("Quality", "End-to-end testing and automation", "端到端测试与自动化"), skill("Design & delivery", "Design systems, agile development and CI/CD", "设计系统、敏捷开发与 CI/CD")],
    education: ["tlu", "ul", "bat", "sut"], experience: ["trip", "aftership", "kickstart", "lecturer"],
    projects: ["trip", "aftership", "grandpa", "website", "missile", "tour", "kitchen", "tetris", "drone"],
  },
  "qa-tester": {
    headline: { en: "QA Tester & Test Automation Engineer", zh: "QA 测试与自动化测试工程师" },
    summary: { en: "QA-focused engineer with 6+ years of experience at Trip.com and AfterShip, combining end-to-end testing leadership with test automation. Led testing that reached 96% coverage at AfterShip, built Python/Poco/pytest-bdd tests across languages and resolutions for a Steam release, and built frontend monitoring at Trip.com that caught 90% of client-side issues before backend log analysis.", zh: "专注质量保障的工程师，拥有 6 年以上经验，曾在携程与 AfterShip 兼顾端到端测试主导与自动化建设。主导 AfterShip 端到端测试，将覆盖率提升至 96%；为 Steam 游戏构建基于 Python、Poco 与 pytest-bdd 的跨语言、跨分辨率测试；并在携程搭建前端监控系统，在后端日志分析前发现 90% 的客户端问题。" },
    skills: [skill("Test automation", "Python, Poco, pytest-bdd and end-to-end testing", "Python、Poco、pytest-bdd 与端到端测试"), skill("Quality & reliability", "96% coverage, frontend monitoring and payment-flow testing", "96% 测试覆盖率、前端监控与支付流程测试"), skill("Full-stack", "React, Node.js, TypeScript and Astro", "React、Node.js、TypeScript 与 Astro"), skill("Automation & cloud", "CI/CD, crawler workflows, Docker, K8S and AWS/GCP", "CI/CD、爬虫工作流、Docker、K8S 与 AWS/GCP")],
    education: ["tlu", "ul", "bat", "sut"], experience: ["kickstart", "aftership", "trip", "lecturer"],
    projects: ["grandpa", "trip", "aftership", "tour", "drone", "website", "missile", "kitchen", "tetris"],
  },
};

export function resumePath(role: ResumeRole, language: ResumeLanguage) {
  return role === "universal" && language === "en" ? "/resume" : `/resume/${role}/${language}`;
}

export function pdfPath(role: ResumeRole, language: ResumeLanguage) {
  return `/resume/pdfs/jian-gong-${role}-${language}.pdf`;
}
