#![no_std]
#![no_main]

use ckb_std::{default_alloc, entry};

default_alloc!();

entry!(program_entry);

fn program_entry() -> i8 {
    0
}
