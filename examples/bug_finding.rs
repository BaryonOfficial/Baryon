// Example: Bug finding









/* Simply, ask the chat (Cmd+L/Ctrl+L) where the bugs in the code are. */


use std::io::{self, Write};
use std::collections::HashSet;

const MAX_TRIES: u8 = 7;
const WORDS: [&str; 3] = ["openai", "chatgpt", "hangman"];

fn main() {
    let word = WORDS[rand::random::<usize>() % WORDS.len()];
    let mut guessed_chars: HashSet<char> = HashSet::new();
    let mut tries_left = MAX_TRIES;

    while tries_left > 0 {
        println!("You have {} tries left.", tries_left);
        print!("Guessed characters: ");
        for ch in &guessed_chars {
            print!("{} ", ch);
        }
        print!("\nWord: ");
        let mut found = false;
        for ch in word.chars() {
            if guessed_chars.contains(&ch) {
                print!("{}", ch);
                found = true;
            } else {
                print!("_");
            }
        }
        println!();

        if found {
            println!("Congratulations, you've won!");
            return;
        }

        let guess = read_char("Your guess: ").unwrap();
        if guessed_chars.contains(&guess) {
            println!("You've already guessed that character.");
            continue;
        }

        guessed_chars.insert(guess);
        if word.contains(guess) {
            println!("Good guess!");
        } else {
            println!("Oops! That letter is not in the word.");
            tries_left -= 1;
        }
    }

    println!("You've lost! The word was '{}'", word);
}

fn read_char(prompt: &str) -> io::Result<char> {
    let mut buffer = String::new();
    print!("{}", prompt);
    io::stdout().flush()?;
    io::stdin().read_line(&mut buffer)?;
    buffer.pop();
    Ok(buffer.chars().next().unwrap())
}