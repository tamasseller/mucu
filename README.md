# MUCU – Minimal Utility Code Underlayer

MUCU is a lightweight tool for generating machine code on demand for bare-metal MCU targets.
It’s not a full compiler and it’s not intended to be used by human developers directly.
Instead, MUCU acts as an *underlayer utility*, providing higher-level software with the ability
to generate compact, task-specific machine code fragments at runtime.

---

## Application

The motivating application is MCU in-circuit programming, where it is beneficial and sometimes
even necessary to run some code on the target CPU to access features like fast flash programming
due to timing constraints that can not be satisfied by external debugger transfer. The typical
solution is to have precompiled binary blobs embedded in the debugger application, which obviously
works fine, but makes development and maintenance of said tools a bit more difficult.

Although the flash-writer use-case can make do with the golden-blob approach because a single one 
can provide support for a whole range of systems, there are some other, more or less related, 
applications that may benefit from programmatical generation of executable code, like:

 - Automated end-of-line testing: external system components can be exercised from whithin the 
   main MCU/SOC on a testcase-by-testcase basis without writing a full-fledged test firmware.
   Basically some of the things can be achieved on low-end MCUs (without proper JTAG support)
   that more capable components can do via JTAG.
 - High performance data acquistion: complex user defined triggers or protocol analyzers can be 
   implemented through regular UI with much higher throughput and flexibility than an interpreted 
   or predefined scheme can achieve.
 - User-programmable control system: high responsivity (i.e. low latency) via direct execution 
   of clicked-together control logic.

### GOALS

 - 🤹 Generate decent code for reasonable inputs -> the whole point is to do something faster
   than could be done without on-target execution.
 - 🪐 Introduce as little usage constraints or conventions as possible -> the idea is being able 
   to use the generated code for any kind of odd little thing, thus facilities like basic I/O 
   or any other sort of communication are left to the higher-level application.
 - 🤏 Keep it small and simple.
	
### NON-GOALS

 - 💻 Do optimizations that can be done in the source -> the subject is small, critical segments,
   the host software can tweak things as needed.
 - 🚀 Generate the absolute best (fastest/smalest) code possible -> fast enough is sufficient.
 - 🎖️  Be right all the time -> must not be left unsupervised.
 - 🔗 Interoperate with conventional code -> no linking, relocations, etc.
 - ⚡ Make the tool itself efficient -> little gain for little code.
