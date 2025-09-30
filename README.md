# MUCU – MCU Utility Code Underlayer

MUCU is a lightweight tool to facilitate composing procedures programmatically and executing them against a bare-metal MCU targets efficiently. 

Its input is a procedurally expressed program in a minimalist AST form, that can be executed via a streaming interpreter or can be translated into machine instructions to be run directly on the CPU of the target.

It’s not a full compiler and it’s not intended to be used by human developers directly. Instead, MUCU acts as an *underlayer utility*, that enables higher-level software to express target operations as relatively high level, almost source code like procedures, while also achieving  satisfactory execution performance.

---

## Application

The motivating application is MCU in-circuit programming, where it is beneficial and sometimes even necessary to run some code on the target CPU to access features like fast flash programming due to timing constraints that can not be satisfied by external debugger transfer. The typical solution is to have precompiled binary blobs embedded in the debugger application, which obviously works fine, but makes development and maintenance of said tools a significantly more demanding task.

Although the flash-writer use-case can make do with the golden-blob approach because a single one can provide support for a whole range of systems, there are some other, more or less related, applications that may benefit from programmatical generation of executable code, like:

 - Automated end-of-line testing: external system components can be exercised from whithin the main MCU/SOC on a testcase-by-testcase basis without writing a full-fledged test firmware. This way most of the things that more capable components can do via JTAG can be achieved on low-end MCUs.
 - High performance data acquistion: with on-target execution complex user defined triggers or protocol analyzers can be implemented through regular UI with high throughput.
 - User-programmable control system: high responsivity (i.e. low latency) via direct execution of clicked-together control logic.

### Compiler

#### GOALS

 - 🤹 Generate decent code for reasonable inputs -> the whole point is to do something faster than could be done without on-target execution.
 - 🪐 Introduce as little usage constraints or conventions as possible -> the idea is being able to use the generated code for any kind of odd little thing, thus facilities like basic I/O or any other sort of communication are left to the higher-level application.
 - 🤏 Keep it small and simple.
	
#### NON-GOALS

 - 💻 Do optimizations that can be done in the source -> the subject is small, critical segments,
   the host software can tweak things as needed.
 - 🚀 Generate the absolute best (fastest/smalest) code possible -> fast enough is sufficient.
 - 🎖️  Be right all the time -> must not be left unsupervised.
 - 🔗 Interoperate with conventional code -> no linking, relocations, etc.
 - ⚡ Make the tool itself efficient -> little gain for little code.

### Interpreter

The interpreter executes the "programmy" bits on its own and executes the load-store and platform specific operations against an accessor interface in a way that enables it to bunch together those. 

This enables efficient execution through a "long fat network" type of connection, such as a USB connection. Which is not that long or fat in general, however when it comes to the very primitive instructions of a debug access port, it really is.

For example a full speed USB link has 1ms frames with a vaguely realistic throughput of ~1MB/s it is completely feasible that hundreds of operations can be in flight at a time.