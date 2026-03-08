/**
 * lessonSystem.ts — Curriculum & Lesson Navigation
 *
 * Ported from CodingTeacherOld/LessonSystem.h + .cpp
 *
 * Contains:
 * 1. Type definitions for the curriculum structure (Difficulty, ContentType, etc.)
 * 2. The LessonSystem class that manages navigation (next/prev lesson, content stepping)
 * 3. The Xbox 360 C++ curriculum data (modules, lessons, content items)
 *
 * The curriculum data is defined inline in createXbox360Curriculum() — same pattern
 * as the original C++. In the future this could be loaded from JSON files, but
 * having it in code means the IDE works without any external data files.
 *
 * This module has NO dependencies on the DOM, Monaco, or Node.js filesystem.
 * It's pure data structures and navigation logic.
 */

// ── Enums ──

/**
 * Difficulty level for a lesson.
 * Affects which lessons are shown to beginners vs advanced users.
 */
export enum Difficulty {
    Beginner = 'beginner',
    Intermediate = 'intermediate',
    Advanced = 'advanced',
}

/**
 * What kind of content item this is within a lesson.
 * The UI renders each type differently:
 * - Text → formatted prose explanation
 * - Code → syntax-highlighted code block
 * - Exercise → editable code area with hint/solution
 * - Quiz → multiple choice question
 * - Visualization → triggers the code visualizer panel (Phase 4)
 */
export enum ContentType {
    Text = 'text',
    Code = 'code',
    Exercise = 'exercise',
    Quiz = 'quiz',
    Visualization = 'visualization',
}

// ── Data Structures ──

/**
 * A single piece of content within a lesson.
 * Lessons are made up of a sequence of these — the user steps through them
 * one at a time with Next/Previous buttons.
 */
export interface LessonContent {
    type: ContentType;
    title: string;
    content: string;        // Main body (text, code, or visualization command)
    hint?: string;          // Hint for exercises
    solution?: string;      // Solution for exercises
    options?: string[];     // Answer options for quiz type
    correctOption?: number; // Index of correct answer for quiz type
}

/**
 * A single lesson. Contains metadata and an ordered list of content items.
 */
export interface Lesson {
    id: string;
    title: string;
    description: string;
    difficulty: Difficulty;
    prerequisites: string[];   // IDs of lessons that should be completed first
    concepts: string[];        // Concept IDs this lesson teaches (matches learningProfile concept IDs)
    content: LessonContent[];
    estimatedMinutes: number;
}

/**
 * A module is a group of related lessons (e.g., "Getting Started", "Control Flow").
 */
export interface Module {
    id: string;
    title: string;
    description: string;
    lessons: Lesson[];
}

/**
 * A curriculum is the top-level container — a complete learning path.
 * Currently there's only one ("C++ for Xbox 360 Development"), but the system
 * supports multiple curricula for future expansion.
 */
export interface Curriculum {
    id: string;
    title: string;
    description: string;
    modules: Module[];
}

// ── Lesson System Class ──

/**
 * LessonSystem — manages curriculum loading, lesson navigation, and content stepping.
 *
 * Usage:
 *   const { lessonSystem } = require('./learning/lessonSystem');
 *   lessonSystem.loadXbox360Curriculum();
 *   const lesson = lessonSystem.getCurrentLesson();
 *   const content = lessonSystem.getCurrentContent();
 *   lessonSystem.nextContent();  // advance to next content item
 *   lessonSystem.nextLesson();   // advance to next lesson
 */
export class LessonSystem {
    /** All loaded curricula. */
    private curricula: Curriculum[] = [];

    /** ID of the currently active curriculum. */
    private activeCurriculumId: string = '';

    /** ID of the current module within the active curriculum. */
    private currentModuleId: string = '';

    /** ID of the current lesson within the current module. */
    private currentLessonId: string = '';

    /** Index of the current content item within the current lesson (0-based). */
    private currentContentIndex: number = 0;

    // ── Loading ──

    /**
     * Load the built-in Xbox 360 C++ curriculum.
     * Sets it as active and navigates to the first lesson.
     */
    loadXbox360Curriculum(): void {
        this.createXbox360Curriculum();
        this.activeCurriculumId = 'xbox360_cpp';

        // Navigate to the first lesson of the first module
        if (this.curricula.length > 0 &&
            this.curricula[0].modules.length > 0 &&
            this.curricula[0].modules[0].lessons.length > 0) {
            this.currentModuleId = this.curricula[0].modules[0].id;
            this.currentLessonId = this.curricula[0].modules[0].lessons[0].id;
        }
    }

    // ── Queries ──

    /** Get all loaded curricula. */
    getCurricula(): Curriculum[] {
        return this.curricula;
    }

    /** Get the currently active curriculum, or null if none. */
    getActiveCurriculum(): Curriculum | null {
        return this.curricula.find(c => c.id === this.activeCurriculumId) || null;
    }

    /** Set which curriculum is active by ID. */
    setActiveCurriculum(id: string): void {
        this.activeCurriculumId = id;
    }

    /** Get a specific lesson by module ID and lesson ID. Returns null if not found. */
    getLesson(moduleId: string, lessonId: string): Lesson | null {
        const curriculum = this.getActiveCurriculum();
        if (!curriculum) return null;

        for (const mod of curriculum.modules) {
            if (mod.id === moduleId) {
                for (const lesson of mod.lessons) {
                    if (lesson.id === lessonId) return lesson;
                }
            }
        }
        return null;
    }

    /** Get the lesson the user is currently viewing. */
    getCurrentLesson(): Lesson | null {
        return this.getLesson(this.currentModuleId, this.currentLessonId);
    }

    /** Get the current module ID. */
    getCurrentModuleId(): string {
        return this.currentModuleId;
    }

    /** Get the current lesson ID. */
    getCurrentLessonId(): string {
        return this.currentLessonId;
    }

    /** Get the current content item index (0-based). */
    getCurrentContentIndex(): number {
        return this.currentContentIndex;
    }

    /** Get the content item the user is currently viewing. */
    getCurrentContent(): LessonContent | null {
        const lesson = this.getCurrentLesson();
        if (!lesson) return null;

        if (this.currentContentIndex >= 0 && this.currentContentIndex < lesson.content.length) {
            return lesson.content[this.currentContentIndex];
        }
        return null;
    }

    // ── Navigation ──

    /** Jump to a specific lesson. Resets content index to 0. */
    goToLesson(moduleId: string, lessonId: string): void {
        this.currentModuleId = moduleId;
        this.currentLessonId = lessonId;
        this.currentContentIndex = 0;
    }

    /**
     * Move to the next lesson in the curriculum.
     * If the current lesson is the last in its module, moves to the first
     * lesson of the next module. If already at the very last lesson, does nothing.
     */
    nextLesson(): void {
        const curriculum = this.getActiveCurriculum();
        if (!curriculum) return;

        let foundCurrent = false;
        for (const mod of curriculum.modules) {
            for (let i = 0; i < mod.lessons.length; i++) {
                if (foundCurrent) {
                    // This is the next lesson after the current one
                    this.currentModuleId = mod.id;
                    this.currentLessonId = mod.lessons[i].id;
                    this.currentContentIndex = 0;
                    return;
                }

                if (mod.id === this.currentModuleId && mod.lessons[i].id === this.currentLessonId) {
                    foundCurrent = true;
                    // Check if there's another lesson in this same module
                    if (i + 1 < mod.lessons.length) {
                        this.currentLessonId = mod.lessons[i + 1].id;
                        this.currentContentIndex = 0;
                        return;
                    }
                    // Otherwise, fall through to the next module's first lesson
                }
            }
        }
    }

    /**
     * Move to the previous lesson in the curriculum.
     * If at the first lesson of a module, moves to the last lesson of the
     * previous module. If already at the very first lesson, does nothing.
     */
    previousLesson(): void {
        const curriculum = this.getActiveCurriculum();
        if (!curriculum) return;

        let prevLesson: Lesson | null = null;
        let prevModuleId = '';

        for (const mod of curriculum.modules) {
            for (const lesson of mod.lessons) {
                if (mod.id === this.currentModuleId && lesson.id === this.currentLessonId) {
                    if (prevLesson) {
                        this.currentModuleId = prevModuleId;
                        this.currentLessonId = prevLesson.id;
                        this.currentContentIndex = 0;
                    }
                    return;
                }
                prevLesson = lesson;
                prevModuleId = mod.id;
            }
        }
    }

    /** Advance to the next content item within the current lesson. */
    nextContent(): void {
        const lesson = this.getCurrentLesson();
        if (!lesson) return;

        if (this.currentContentIndex < lesson.content.length - 1) {
            this.currentContentIndex++;
        }
    }

    /** Go back to the previous content item within the current lesson. */
    previousContent(): void {
        if (this.currentContentIndex > 0) {
            this.currentContentIndex--;
        }
    }

    // ── Curriculum Data ──

    /**
     * Build the Xbox 360 C++ curriculum.
     *
     * This is a direct port of CodingTeacherOld's CreateXbox360Curriculum().
     * Each module contains lessons, and each lesson contains ordered content items
     * (text explanations, code examples, exercises, quiz questions, visualizations).
     *
     * The content items use the same text as the original C++ version, minus the
     * wide string (L"") prefixes.
     */
    private createXbox360Curriculum(): void {
        const curriculum: Curriculum = {
            id: 'xbox360_cpp',
            title: 'C++ for Xbox 360 Development',
            description: 'Learn C++ programming with a focus on Xbox 360 game development. '
                + 'Start from the basics and work your way up to creating your own games.',
            modules: [],
        };

        // ── Module 1: Getting Started ──
        {
            const mod: Module = {
                id: 'getting_started',
                title: 'Getting Started',
                description: 'Introduction to C++ and Xbox 360 development',
                lessons: [],
            };

            // Lesson 1.1: Hello Xbox 360
            mod.lessons.push({
                id: 'hello_xbox',
                title: 'Hello Xbox 360',
                description: 'Your first Xbox 360 program',
                difficulty: Difficulty.Beginner,
                prerequisites: [],
                concepts: ['program_structure', 'main_function', 'includes'],
                estimatedMinutes: 15,
                content: [
                    {
                        type: ContentType.Text,
                        title: 'Welcome to Xbox 360 Development!',
                        content: 'Welcome to your journey into Xbox 360 game development!\n\n'
                            + 'In this lesson, you\'ll learn the basic structure of a C++ program '
                            + 'and write your first code that can run on an Xbox 360.\n\n'
                            + 'Don\'t worry if you\'ve never programmed before — we\'ll take it step by step.',
                        hint: '', solution: '', options: [], correctOption: 0,
                    },
                    {
                        type: ContentType.Text,
                        title: 'What is C++?',
                        content: 'C++ is a powerful programming language used to create games, operating systems, '
                            + 'and high-performance applications.\n\n'
                            + 'The Xbox 360 uses C++ (specifically the C++03 standard) for its games. '
                            + 'Learning C++ for Xbox 360 will also teach you skills that transfer to '
                            + 'modern game development on PC, PlayStation, and other platforms.',
                        hint: '', solution: '', options: [], correctOption: 0,
                    },
                    {
                        type: ContentType.Code,
                        title: 'Your First Program',
                        content: '#include <xtl.h>\n\n'
                            + 'int main()\n'
                            + '{\n'
                            + '    // This is a comment — the computer ignores it\n'
                            + '    // It\'s for humans to read!\n'
                            + '    \n'
                            + '    OutputDebugStringA("Hello, Xbox 360!\\n");\n'
                            + '    \n'
                            + '    return 0;\n'
                            + '}',
                        hint: '', solution: '', options: [], correctOption: 0,
                    },
                    {
                        type: ContentType.Text,
                        title: 'Breaking It Down',
                        content: 'Let\'s understand each part:\n\n'
                            + '#include <xtl.h> — This includes Xbox 360 functions we need\n\n'
                            + 'int main() — This is where your program starts running\n\n'
                            + '{ } — Curly braces group code together\n\n'
                            + '// — Double slashes start a comment\n\n'
                            + 'OutputDebugStringA() — Prints a message for debugging\n\n'
                            + 'return 0 — Tells the system the program finished successfully',
                        hint: '', solution: '', options: [], correctOption: 0,
                    },
                    {
                        type: ContentType.Exercise,
                        title: 'Try It Yourself',
                        content: 'Modify the program to print your own message.\n'
                            + 'Change "Hello, Xbox 360!" to something else — maybe your name!',
                        hint: 'Remember to keep the quotes and the \\n at the end',
                        solution: 'OutputDebugStringA("My name is [Your Name]!\\n");',
                        options: [], correctOption: 0,
                    },
                ],
            });

            // Lesson 1.2: Variables & Types
            mod.lessons.push({
                id: 'variables',
                title: 'Variables & Types',
                description: 'Storing and using data',
                difficulty: Difficulty.Beginner,
                prerequisites: ['hello_xbox'],
                concepts: ['variables', 'data_types', 'assignment'],
                estimatedMinutes: 20,
                content: [
                    {
                        type: ContentType.Text,
                        title: 'What are Variables?',
                        content: 'Variables are like labeled boxes that store information.\n\n'
                            + 'Imagine you have a box labeled "score" — you can put a number in it, '
                            + 'change that number, or look at what\'s inside.\n\n'
                            + 'In programming, we create variables to store data our program needs to remember.',
                        hint: '', solution: '', options: [], correctOption: 0,
                    },
                    {
                        type: ContentType.Visualization,
                        title: 'Variable in Memory',
                        content: 'VARIABLE:score:int:42',
                        hint: '', solution: '', options: [], correctOption: 0,
                    },
                    {
                        type: ContentType.Code,
                        title: 'Creating Variables',
                        content: '#include <xtl.h>\n\n'
                            + 'int main()\n'
                            + '{\n'
                            + '    // Integer — whole numbers\n'
                            + '    int score = 0;\n'
                            + '    int lives = 3;\n'
                            + '    \n'
                            + '    // Floating point — decimal numbers\n'
                            + '    float speed = 5.5f;\n'
                            + '    \n'
                            + '    // Boolean — true or false\n'
                            + '    bool isGameOver = false;\n'
                            + '    \n'
                            + '    // Character — single letter\n'
                            + '    char grade = \'A\';\n'
                            + '    \n'
                            + '    return 0;\n'
                            + '}',
                        hint: '', solution: '', options: [], correctOption: 0,
                    },
                    {
                        type: ContentType.Text,
                        title: 'Common Data Types',
                        content: 'int — Whole numbers like 1, 42, -100\n\n'
                            + 'float — Decimal numbers like 3.14, -0.5 (add \'f\' at the end)\n\n'
                            + 'bool — Either true or false\n\n'
                            + 'char — A single character like \'A\' or \'7\'\n\n'
                            + 'For Xbox 360, you\'ll also see:\n'
                            + 'DWORD — Unsigned 32-bit number\n'
                            + 'BYTE — Unsigned 8-bit number (0-255)',
                        hint: '', solution: '', options: [], correctOption: 0,
                    },
                    {
                        type: ContentType.Exercise,
                        title: 'Create Your Game Variables',
                        content: 'Create variables for a simple game:\n'
                            + '- Player health (starts at 100)\n'
                            + '- Player name initial (a character)\n'
                            + '- Movement speed (a decimal number)\n'
                            + '- Is the player alive? (true/false)',
                        hint: 'Think about what type each variable should be',
                        solution: 'int health = 100;\nchar initial = \'P\';\nfloat moveSpeed = 2.5f;\nbool isAlive = true;',
                        options: [], correctOption: 0,
                    },
                ],
            });

            curriculum.modules.push(mod);
        }

        // ── Module 2: Control Flow ──
        {
            const mod: Module = {
                id: 'control_flow',
                title: 'Control Flow',
                description: 'Making decisions and repeating actions',
                lessons: [],
            };

            // Lesson 2.1: If Statements
            mod.lessons.push({
                id: 'if_statements',
                title: 'Making Decisions',
                description: 'Using if, else if, and else',
                difficulty: Difficulty.Beginner,
                prerequisites: ['variables'],
                concepts: ['if_statement', 'conditions', 'comparison_operators'],
                estimatedMinutes: 20,
                content: [
                    {
                        type: ContentType.Text,
                        title: 'Making Decisions',
                        content: 'Games constantly make decisions:\n'
                            + '- If the player presses A, jump\n'
                            + '- If health reaches 0, game over\n'
                            + '- If score > 1000, advance to next level\n\n'
                            + 'In C++, we use \'if\' statements to make decisions.',
                        hint: '', solution: '', options: [], correctOption: 0,
                    },
                    {
                        type: ContentType.Code,
                        title: 'If Statement Syntax',
                        content: 'int health = 75;\n\n'
                            + 'if (health <= 0)\n'
                            + '{\n'
                            + '    // This runs if health is 0 or less\n'
                            + '    OutputDebugStringA("Game Over!\\n");\n'
                            + '}\n'
                            + 'else if (health < 25)\n'
                            + '{\n'
                            + '    // This runs if health is low but not zero\n'
                            + '    OutputDebugStringA("Warning: Low health!\\n");\n'
                            + '}\n'
                            + 'else\n'
                            + '{\n'
                            + '    // This runs if none of the above are true\n'
                            + '    OutputDebugStringA("Health is OK\\n");\n'
                            + '}',
                        hint: '', solution: '', options: [], correctOption: 0,
                    },
                    {
                        type: ContentType.Text,
                        title: 'Comparison Operators',
                        content: '== Equal to (not =, that\'s assignment!)\n'
                            + '!= Not equal to\n'
                            + '< Less than\n'
                            + '> Greater than\n'
                            + '<= Less than or equal\n'
                            + '>= Greater than or equal\n\n'
                            + 'You can combine conditions:\n'
                            + '&& means AND (both must be true)\n'
                            + '|| means OR (either can be true)',
                        hint: '', solution: '', options: [], correctOption: 0,
                    },
                ],
            });

            // Lesson 2.2: Loops
            mod.lessons.push({
                id: 'loops',
                title: 'Loops',
                description: 'Repeating actions with for and while',
                difficulty: Difficulty.Beginner,
                prerequisites: ['if_statements'],
                concepts: ['for_loop', 'while_loop', 'iteration'],
                estimatedMinutes: 25,
                content: [
                    {
                        type: ContentType.Text,
                        title: 'Why Loops?',
                        content: 'Games need to do things repeatedly:\n'
                            + '- Update every enemy\'s position\n'
                            + '- Check each bullet for collisions\n'
                            + '- Draw every frame 60 times per second\n\n'
                            + 'Loops let us repeat code without writing it over and over.',
                        hint: '', solution: '', options: [], correctOption: 0,
                    },
                    {
                        type: ContentType.Code,
                        title: 'For Loop',
                        content: '// Count from 0 to 9\n'
                            + 'for (int i = 0; i < 10; i++)\n'
                            + '{\n'
                            + '    // \'i\' goes: 0, 1, 2, 3, 4, 5, 6, 7, 8, 9\n'
                            + '    // i++ means "add 1 to i"\n'
                            + '}\n\n'
                            + '// Update all 5 enemies\n'
                            + 'for (int enemy = 0; enemy < 5; enemy++)\n'
                            + '{\n'
                            + '    // Update enemy[enemy]\n'
                            + '}',
                        hint: '', solution: '', options: [], correctOption: 0,
                    },
                    {
                        type: ContentType.Code,
                        title: 'While Loop',
                        content: '// The game loop — runs until game is over\n'
                            + 'bool gameRunning = true;\n\n'
                            + 'while (gameRunning)\n'
                            + '{\n'
                            + '    // Process input\n'
                            + '    // Update game state\n'
                            + '    // Render graphics\n'
                            + '    \n'
                            + '    if (playerQuit)\n'
                            + '    {\n'
                            + '        gameRunning = false;\n'
                            + '    }\n'
                            + '}',
                        hint: '', solution: '', options: [], correctOption: 0,
                    },
                ],
            });

            curriculum.modules.push(mod);
        }

        // ── Module 3: Functions ──
        {
            const mod: Module = {
                id: 'functions',
                title: 'Functions',
                description: 'Organizing code into reusable pieces',
                lessons: [],
            };

            mod.lessons.push({
                id: 'intro_functions',
                title: 'Introduction to Functions',
                description: 'Creating and calling functions',
                difficulty: Difficulty.Beginner,
                prerequisites: ['loops'],
                concepts: ['function_definition', 'parameters', 'return_values'],
                estimatedMinutes: 25,
                content: [
                    {
                        type: ContentType.Text,
                        title: 'What are Functions?',
                        content: 'Functions are reusable blocks of code with a name.\n\n'
                            + 'Instead of writing the same code many times, you write it once in a function '
                            + 'and then \'call\' that function whenever you need it.\n\n'
                            + 'Think of a function like a recipe — you define the steps once, then follow them '
                            + 'whenever you want to make that dish.',
                        hint: '', solution: '', options: [], correctOption: 0,
                    },
                    {
                        type: ContentType.Code,
                        title: 'Creating a Function',
                        content: '// Function that adds two numbers and returns the result\n'
                            + 'int Add(int a, int b)\n'
                            + '{\n'
                            + '    int result = a + b;\n'
                            + '    return result;\n'
                            + '}\n\n'
                            + '// Function that doesn\'t return anything\n'
                            + 'void PrintScore(int score)\n'
                            + '{\n'
                            + '    // Just prints, doesn\'t return\n'
                            + '}\n\n'
                            + 'int main()\n'
                            + '{\n'
                            + '    int sum = Add(5, 3);  // sum is now 8\n'
                            + '    PrintScore(sum);\n'
                            + '    return 0;\n'
                            + '}',
                        hint: '', solution: '', options: [], correctOption: 0,
                    },
                ],
            });

            curriculum.modules.push(mod);
        }

        // ── Module 4: Pointers & Memory ──
        {
            const mod: Module = {
                id: 'pointers',
                title: 'Pointers & Memory',
                description: 'Understanding memory and pointers',
                lessons: [],
            };

            mod.lessons.push({
                id: 'intro_pointers',
                title: 'Introduction to Pointers',
                description: 'Understanding memory addresses',
                difficulty: Difficulty.Intermediate,
                prerequisites: ['intro_functions'],
                concepts: ['pointers', 'memory_addresses', 'dereferencing'],
                estimatedMinutes: 30,
                content: [
                    {
                        type: ContentType.Text,
                        title: 'What are Pointers?',
                        content: 'A pointer is a variable that stores a memory address.\n\n'
                            + 'Think of computer memory like a huge row of numbered mailboxes. '
                            + 'Each mailbox has an address (like 1, 2, 3...) and can hold one piece of data.\n\n'
                            + 'A pointer is like a piece of paper with a mailbox address written on it. '
                            + 'It doesn\'t hold the actual data — it tells you WHERE to find the data.',
                        hint: '', solution: '', options: [], correctOption: 0,
                    },
                    {
                        type: ContentType.Visualization,
                        title: 'Pointer Visualization',
                        content: 'POINTER:ptr:score',
                        hint: '', solution: '', options: [], correctOption: 0,
                    },
                    {
                        type: ContentType.Code,
                        title: 'Pointer Syntax',
                        content: 'int score = 42;        // Regular variable\n'
                            + 'int* ptr = &score;     // Pointer to score\n'
                            + '                       // & means "address of"\n\n'
                            + '// Reading through a pointer\n'
                            + 'int value = *ptr;      // value is now 42\n'
                            + '                       // * means "value at address"\n\n'
                            + '// Writing through a pointer\n'
                            + '*ptr = 100;            // score is now 100!',
                        hint: '', solution: '', options: [], correctOption: 0,
                    },
                ],
            });

            curriculum.modules.push(mod);
        }

        // ── Module 5: Data & I/O ──
        {
            const mod: Module = {
                id: 'mod5-data-io',
                title: 'Data & I/O',
                description: 'Data types, strings, and input/output operations',
                lessons: [],
            };

            mod.lessons.push({
                id: 'data_types_deep',
                title: 'Data Types in Depth',
                description: 'Understanding int, float, bool, char and their sizes',
                difficulty: Difficulty.Beginner,
                prerequisites: ['variables'],
                concepts: ['data_types', 'variables'],
                estimatedMinutes: 15,
                content: [
                    {
                        type: ContentType.Text,
                        title: 'Types Are Boxes of Different Sizes',
                        content: 'Think of data types as boxes of different sizes. An int is a medium box (4 bytes) that holds whole numbers. A float is the same size but stores decimals. A char is tiny (1 byte) and holds a single character. A bool is the smallest — just true or false.',
                    },
                    {
                        type: ContentType.Code,
                        title: 'The Fundamental Types',
                        content: 'int health = 100;          // 4 bytes, whole numbers\nfloat speed = 3.14f;       // 4 bytes, decimal numbers\nbool isAlive = true;       // 1 byte, true or false\nchar grade = \'A\';          // 1 byte, single character\ndouble precision = 3.14159; // 8 bytes, high-precision decimal\nlong long bigNum = 9999999999LL; // 8 bytes, very large integers',
                    },
                    {
                        type: ContentType.Visualization,
                        title: 'Variable Sizes',
                        content: 'VARIABLE:health:int:100',
                    },
                    {
                        type: ContentType.Text,
                        title: 'Why Types Matter on Xbox 360',
                        content: 'The Xbox 360 Xenon CPU is PowerPC — a 32-bit architecture. int is 32 bits (4 bytes), which matches the CPU register size perfectly. Using the right type means faster code. float operations use the VMX128 vector unit, which can process 4 floats at once — essential for game math.',
                    },
                    {
                        type: ContentType.Exercise,
                        title: 'Declare Game Variables',
                        content: 'Declare variables for a game character: health (whole number), moveSpeed (decimal), playerName (will learn strings next), and isJumping (true/false).',
                        hint: 'Use int for health, float for moveSpeed, and bool for isJumping.',
                    },
                ],
            });

            mod.lessons.push({
                id: 'strings_basics',
                title: 'Working with Strings',
                description: 'Text manipulation with std::string and C-style strings',
                difficulty: Difficulty.Beginner,
                prerequisites: ['data_types_deep'],
                concepts: ['data_types', 'variables'],
                estimatedMinutes: 12,
                content: [
                    {
                        type: ContentType.Text,
                        title: 'Strings — Storing Text',
                        content: 'A string is a sequence of characters. In C++, you have two options: C-style strings (char arrays) and std::string (the modern way). On Xbox 360, std::string works fine but many SDK functions expect C-style strings (const char* or const wchar_t*).',
                    },
                    {
                        type: ContentType.Code,
                        title: 'String Basics',
                        content: '#include <string>\n\nstd::string playerName = "Master Chief";\nstd::string greeting = "Hello, " + playerName + "!";\n\n// Get the length\nint len = playerName.length(); // 12\n\n// C-style conversion (needed for Xbox SDK)\nconst char* cstr = playerName.c_str();\n\n// Xbox 360 debug output\nOutputDebugStringA(greeting.c_str());',
                    },
                    {
                        type: ContentType.Exercise,
                        title: 'Build a Score Display',
                        content: 'Create a string that says "Score: 1000" by combining a std::string with a number. Hint: use std::to_string() to convert numbers to strings.',
                        hint: 'std::string display = "Score: " + std::to_string(score);',
                    },
                ],
            });

            mod.lessons.push({
                id: 'input_output',
                title: 'Input & Output',
                description: 'Console I/O and Xbox 360 debug output',
                difficulty: Difficulty.Beginner,
                prerequisites: ['strings_basics'],
                concepts: ['data_types'],
                estimatedMinutes: 10,
                content: [
                    {
                        type: ContentType.Text,
                        title: 'Talking to the Outside World',
                        content: 'On a PC, programs use cout and cin for console output and input. On Xbox 360, there is no console — instead you use OutputDebugStringA() to write to the debug output (visible in Nexia IDE\'s Output panel when connected to a devkit).',
                    },
                    {
                        type: ContentType.Code,
                        title: 'Output on PC vs Xbox 360',
                        content: '// PC console output\n#include <iostream>\nstd::cout << "Hello World!" << std::endl;\nstd::cout << "Score: " << score << std::endl;\n\n// Xbox 360 debug output\n#include <xtl.h>\nOutputDebugStringA("Hello from Xbox 360!\\n");\n\n// Formatted debug output (sprintf style)\nchar buf[256];\nsprintf_s(buf, "Score: %d\\n", score);\nOutputDebugStringA(buf);',
                    },
                    {
                        type: ContentType.Exercise,
                        title: 'Debug Output Practice',
                        content: 'Write code that outputs "Player health: 100" to the Xbox 360 debug output using OutputDebugStringA and sprintf_s.',
                        hint: 'Use sprintf_s(buf, "Player health: %d\\n", health); then OutputDebugStringA(buf);',
                    },
                ],
            });

            curriculum.modules.push(mod);
        }

        // ── Module 6: Arrays & Collections ──
        {
            const mod: Module = {
                id: 'mod6-arrays',
                title: 'Arrays & Collections',
                description: 'Fixed arrays, 2D arrays for game grids, and vectors',
                lessons: [],
            };

            mod.lessons.push({
                id: 'arrays_basics',
                title: 'Arrays — Multiple Values',
                description: 'Storing collections of same-type values',
                difficulty: Difficulty.Intermediate,
                prerequisites: ['loops'],
                concepts: ['arrays', 'iteration'],
                estimatedMinutes: 15,
                content: [
                    {
                        type: ContentType.Text,
                        title: 'Arrays Are Rows of Boxes',
                        content: 'An array is a fixed-size row of boxes, all the same type, stored side by side in memory. Instead of declaring score1, score2, score3... you declare one array: int scores[3]. Each box has an index starting at 0.',
                    },
                    {
                        type: ContentType.Code,
                        title: 'Array Basics',
                        content: 'int scores[5] = {100, 85, 92, 78, 95};\n\n// Access by index (0-based)\nint first = scores[0];  // 100\nint last = scores[4];   // 95\n\n// Modify\nscores[2] = 99;\n\n// Loop through all\nfor (int i = 0; i < 5; i++) {\n    OutputDebugStringA(std::to_string(scores[i]).c_str());\n}',
                    },
                    {
                        type: ContentType.Visualization,
                        title: 'Array in Memory',
                        content: 'ARRAY:scores:100,85,92,78,95',
                    },
                    {
                        type: ContentType.Text,
                        title: 'Why Arrays Matter for Games',
                        content: 'Games use arrays everywhere: enemy lists, particle systems, vertex buffers. On Xbox 360, arrays are cache-friendly — the CPU can prefetch sequential data. This makes iterating over arrays much faster than chasing pointers through scattered memory.',
                    },
                    {
                        type: ContentType.Exercise,
                        title: 'Enemy Health Tracker',
                        content: 'Create an array of 4 enemy health values. Write a loop that subtracts 10 from each enemy\'s health.',
                        hint: 'int enemies[4] = {100, 80, 60, 40}; then loop with enemies[i] -= 10;',
                    },
                ],
            });

            mod.lessons.push({
                id: 'arrays_2d',
                title: '2D Arrays — Game Grids',
                description: 'Multi-dimensional arrays for tile maps and grids',
                difficulty: Difficulty.Intermediate,
                prerequisites: ['arrays_basics'],
                concepts: ['arrays', 'iteration'],
                estimatedMinutes: 12,
                content: [
                    {
                        type: ContentType.Text,
                        title: 'Grids Are Arrays of Arrays',
                        content: 'A 2D array is an array of arrays — perfect for tile maps, game boards, and screen buffers. Access elements with two indices: grid[row][col]. On Xbox 360, the 1280x720 framebuffer is essentially a giant 2D array of color values.',
                    },
                    {
                        type: ContentType.Code,
                        title: '2D Array — Tile Map',
                        content: '// 0=empty, 1=wall, 2=player, 3=enemy\nint map[4][6] = {\n    {1, 1, 1, 1, 1, 1},\n    {1, 2, 0, 0, 3, 1},\n    {1, 0, 1, 0, 0, 1},\n    {1, 1, 1, 1, 1, 1},\n};\n\n// Check what\'s at position (1, 3)\nif (map[1][3] == 0) {\n    // Empty space — player can move here\n}',
                    },
                    {
                        type: ContentType.Exercise,
                        title: 'Build a Mini Map',
                        content: 'Create a 3x3 grid where the center is the player (2) and the edges are walls (1). Write nested loops to print each row.',
                        hint: 'int grid[3][3] = {{1,1,1},{1,2,1},{1,1,1}};',
                    },
                ],
            });

            curriculum.modules.push(mod);
        }

        // ── Module 7: Classes & OOP ──
        {
            const mod: Module = {
                id: 'mod7-classes',
                title: 'Classes & OOP',
                description: 'Object-oriented programming with structs and classes',
                lessons: [],
            };

            mod.lessons.push({
                id: 'intro_classes',
                title: 'Classes — Blueprints for Objects',
                description: 'Creating custom types with data and behavior',
                difficulty: Difficulty.Intermediate,
                prerequisites: ['intro_functions'],
                concepts: ['classes', 'objects'],
                estimatedMinutes: 15,
                content: [
                    {
                        type: ContentType.Text,
                        title: 'Classes Are Blueprints',
                        content: 'A class is a blueprint that bundles data (what something IS) and functions (what something DOES) together. Think of a class as a cookie cutter — the class defines the shape, and each object is a cookie made from that cutter.',
                    },
                    {
                        type: ContentType.Code,
                        title: 'Your First Class',
                        content: 'class Player {\npublic:\n    int health;\n    float x, y;\n    float speed;\n\n    void Move(float dx, float dy) {\n        x += dx * speed;\n        y += dy * speed;\n    }\n\n    bool IsAlive() {\n        return health > 0;\n    }\n};\n\n// Create an object\nPlayer p1;\np1.health = 100;\np1.x = 0; p1.y = 0;\np1.speed = 5.0f;\np1.Move(1.0f, 0.0f);  // Move right',
                    },
                    {
                        type: ContentType.Visualization,
                        title: 'Class Structure',
                        content: 'CLASS:Player:+health:int,+x:float,+y:float,+speed:float|+Move(dx,dy):void,+IsAlive():bool',
                    },
                    {
                        type: ContentType.Exercise,
                        title: 'Design an Enemy Class',
                        content: 'Create an Enemy class with health, damage, and a TakeDamage(int amount) method that reduces health.',
                        hint: 'void TakeDamage(int amount) { health -= amount; }',
                    },
                ],
            });

            mod.lessons.push({
                id: 'constructors',
                title: 'Constructors & Destructors',
                description: 'Automatic initialization and cleanup',
                difficulty: Difficulty.Intermediate,
                prerequisites: ['intro_classes'],
                concepts: ['constructors', 'classes'],
                estimatedMinutes: 12,
                content: [
                    {
                        type: ContentType.Text,
                        title: 'Constructors Set Things Up',
                        content: 'A constructor is a special function that runs automatically when an object is created. It has the same name as the class and no return type. The destructor (prefixed with ~) runs when the object is destroyed — perfect for cleaning up resources like textures or audio buffers on Xbox 360.',
                    },
                    {
                        type: ContentType.Code,
                        title: 'Constructor & Destructor',
                        content: 'class Texture {\npublic:\n    int width, height;\n    void* data;\n\n    // Constructor — called when created\n    Texture(int w, int h) {\n        width = w;\n        height = h;\n        data = malloc(w * h * 4);\n    }\n\n    // Destructor — called when destroyed\n    ~Texture() {\n        free(data);\n    }\n};\n\n// Constructor runs automatically\nTexture tex(1280, 720);\n// Destructor runs when tex goes out of scope',
                    },
                    {
                        type: ContentType.Text,
                        title: 'Why This Matters on Xbox 360',
                        content: 'The Xbox 360 has 512MB shared RAM. If you forget to free GPU textures or audio buffers, you will run out of memory fast. Destructors make cleanup automatic — when a Texture object is destroyed, its memory is freed. This pattern (RAII) is fundamental to reliable Xbox 360 code.',
                    },
                ],
            });

            mod.lessons.push({
                id: 'inheritance_basics',
                title: 'Inheritance — Building on Others',
                description: 'Creating specialized classes from general ones',
                difficulty: Difficulty.Intermediate,
                prerequisites: ['constructors'],
                concepts: ['inheritance', 'classes'],
                estimatedMinutes: 15,
                content: [
                    {
                        type: ContentType.Text,
                        title: 'Inheritance Is Specialization',
                        content: 'Inheritance lets you create a new class based on an existing one. The new class (child) inherits all the data and methods of the original (parent), and can add or override them. Think: a Zombie IS an Enemy with extra behavior.',
                    },
                    {
                        type: ContentType.Code,
                        title: 'Base and Derived Classes',
                        content: 'class Entity {\npublic:\n    float x, y;\n    virtual void Update() {\n        // Base behavior\n    }\n};\n\nclass Enemy : public Entity {\npublic:\n    int health;\n    void Update() override {\n        // Enemy-specific behavior\n        x += 1.0f; // Patrol\n    }\n};\n\nclass Boss : public Enemy {\npublic:\n    int phase;\n    void Update() override {\n        // Boss-specific AI\n        if (phase == 2) x += 3.0f; // Faster!\n    }\n};',
                    },
                    {
                        type: ContentType.Visualization,
                        title: 'Inheritance Hierarchy',
                        content: 'CLASS:Entity:+x:float,+y:float|+Update():void',
                    },
                ],
            });

            curriculum.modules.push(mod);
        }

        // ── Module 8: Xbox 360 Specifics ──
        {
            const mod: Module = {
                id: 'mod8-xbox360',
                title: 'Xbox 360 Specifics',
                description: 'Xenon CPU, D3D9, XInput, and building XEX files',
                lessons: [],
            };

            mod.lessons.push({
                id: 'xbox_architecture',
                title: 'Xbox 360 Architecture',
                description: 'Understanding the Xenon CPU, Xenos GPU, and memory layout',
                difficulty: Difficulty.Advanced,
                prerequisites: ['inheritance_basics'],
                concepts: ['xbox_architecture'],
                estimatedMinutes: 15,
                content: [
                    {
                        type: ContentType.Text,
                        title: 'The Xenon CPU',
                        content: 'The Xbox 360 runs a custom IBM PowerPC chip called Xenon. It has 3 cores, each running at 3.2 GHz, with 2 hardware threads per core (6 threads total). It is BIG ENDIAN — the opposite of PC x86. This means multi-byte values are stored most-significant-byte first. You must byte-swap data when porting from PC.',
                    },
                    {
                        type: ContentType.Text,
                        title: 'Memory Layout',
                        content: 'The Xbox 360 has 512MB of unified RAM shared between CPU and GPU. There is no separate VRAM. The GPU (Xenos) has 10MB of eDRAM (embedded DRAM) used as a render target. At 1280x720x32bpp, the framebuffer takes ~3.5MB of eDRAM, leaving room for depth buffer and MSAA.',
                    },
                    {
                        type: ContentType.Code,
                        title: 'Big Endian Byte Swapping',
                        content: '// On Xbox 360, reading a PC binary file:\nunsigned int value;\nfread(&value, 4, 1, file);\n\n// Must byte-swap! PC is little-endian, Xbox is big-endian\nvalue = _byteswap_ulong(value);\n\n// For shorts:\nunsigned short sval = _byteswap_ushort(raw_short);\n\n// For 64-bit:\nunsigned long long lval = _byteswap_uint64(raw_long);',
                    },
                ],
            });

            mod.lessons.push({
                id: 'd3d_basics',
                title: 'Direct3D 9 on Xbox 360',
                description: 'Initializing D3D, the render loop, and drawing',
                difficulty: Difficulty.Advanced,
                prerequisites: ['xbox_architecture'],
                concepts: ['d3d_basics', 'game_loop'],
                estimatedMinutes: 20,
                content: [
                    {
                        type: ContentType.Text,
                        title: 'The Render Loop',
                        content: 'Every Xbox 360 game follows the same pattern: initialize D3D, then loop forever doing Update (game logic) and Render (drawing). The render loop clears the screen, draws everything, then presents the frame. Xbox 360 always outputs at 720p (1280x720).',
                    },
                    {
                        type: ContentType.Code,
                        title: 'Basic D3D9 Game Loop',
                        content: '#include <xtl.h>\n#include <xgraphics.h>\n\nIDirect3DDevice9* g_pd3dDevice = NULL;\n\nvoid InitD3D() {\n    IDirect3D9* pD3D = Direct3DCreate9(D3D_SDK_VERSION);\n    D3DPRESENT_PARAMETERS d3dpp = {};\n    d3dpp.BackBufferWidth = 1280;\n    d3dpp.BackBufferHeight = 720;\n    d3dpp.BackBufferFormat = D3DFMT_X8R8G8B8;\n    d3dpp.PresentationInterval = D3DPRESENT_INTERVAL_ONE;\n    pD3D->CreateDevice(0, D3DDEVTYPE_HAL, NULL,\n        D3DCREATE_HARDWARE_VERTEXPROCESSING, &d3dpp, &g_pd3dDevice);\n}\n\nvoid Render() {\n    g_pd3dDevice->Clear(0, NULL, D3DCLEAR_TARGET | D3DCLEAR_ZBUFFER,\n        D3DCOLOR_XRGB(0, 0, 40), 1.0f, 0);\n    g_pd3dDevice->BeginScene();\n    // Draw your game here\n    g_pd3dDevice->EndScene();\n    g_pd3dDevice->Present(NULL, NULL, NULL, NULL);\n}',
                    },
                    {
                        type: ContentType.Visualization,
                        title: 'Game Loop Flow',
                        content: 'FLOW:Init D3D->Update Game->Render Frame->Present->Update Game',
                    },
                    {
                        type: ContentType.Text,
                        title: 'The 10MB eDRAM Advantage',
                        content: 'The Xbox 360 Xenos GPU has 10MB of eDRAM that acts as an ultra-fast render target. Pixel fill operations (clearing, blending, MSAA) happen in eDRAM at extreme bandwidth. This is why Xbox 360 games could do 4x MSAA "for free" — the eDRAM handles it in hardware.',
                    },
                ],
            });

            mod.lessons.push({
                id: 'xinput_basics',
                title: 'XInput — Controller Input',
                description: 'Reading gamepad buttons, thumbsticks, and triggers',
                difficulty: Difficulty.Advanced,
                prerequisites: ['d3d_basics'],
                concepts: ['xinput', 'game_loop'],
                estimatedMinutes: 12,
                content: [
                    {
                        type: ContentType.Text,
                        title: 'Reading the Controller',
                        content: 'Xbox 360 supports up to 4 wireless controllers. Use XInputGetState() each frame to read the current button/stick/trigger state. On Xbox 360, include <xinput2.h> (not <xinput.h> which is the PC version).',
                    },
                    {
                        type: ContentType.Code,
                        title: 'Reading Gamepad Input',
                        content: '#include <xinput2.h>\n\nXINPUT_STATE state;\nZeroMemory(&state, sizeof(XINPUT_STATE));\n\nif (XInputGetState(0, &state) == ERROR_SUCCESS) {\n    // Buttons\n    if (state.Gamepad.wButtons & XINPUT_GAMEPAD_A)\n        Jump();\n    if (state.Gamepad.wButtons & XINPUT_GAMEPAD_START)\n        PauseGame();\n\n    // Left thumbstick (-32768 to 32767)\n    float lx = state.Gamepad.sThumbLX / 32768.0f;\n    float ly = state.Gamepad.sThumbLY / 32768.0f;\n    MovePlayer(lx, ly);\n\n    // Triggers (0 to 255)\n    float rt = state.Gamepad.bRightTrigger / 255.0f;\n    if (rt > 0.1f) Shoot(rt); // Analog shooting\n}',
                    },
                    {
                        type: ContentType.Exercise,
                        title: 'Add Controller Input',
                        content: 'Write code that reads the B button to fire a weapon and the left trigger to brake a vehicle. Include a deadzone check for the thumbstick (ignore values below 0.2).',
                        hint: 'Use XINPUT_GAMEPAD_B for fire. For deadzone: if (fabs(lx) < 0.2f) lx = 0;',
                    },
                ],
            });

            curriculum.modules.push(mod);
        }

        this.curricula.push(curriculum);
    }
}

// ── Singleton Instance ──

export const lessonSystem = new LessonSystem();
