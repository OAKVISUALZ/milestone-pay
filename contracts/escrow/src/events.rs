use soroban_sdk::{symbol_short, Address, Env};

pub fn emit_agreement_created(
    env: &Env,
    agreement_id: u64,
    client: &Address,
    freelancer: &Address,
    token: &Address,
    milestone_count: u32,
) {
    let topics = (symbol_short!("ag_create"), agreement_id);
    let data = (client.clone(), freelancer.clone(), token.clone(), milestone_count);
    env.events().publish(topics, data);
}

pub fn emit_milestone_funded(
    env: &Env,
    agreement_id: u64,
    milestone_id: u32,
    amount: i128,
) {
    let topics = (symbol_short!("ms_fund"), agreement_id, milestone_id);
    env.events().publish(topics, amount);
}

pub fn emit_milestone_released(
    env: &Env,
    agreement_id: u64,
    milestone_id: u32,
    freelancer: &Address,
    amount: i128,
) {
    let topics = (symbol_short!("ms_rel"), agreement_id, milestone_id);
    let data = (freelancer.clone(), amount);
    env.events().publish(topics, data);
}

pub fn emit_milestone_refunded(
    env: &Env,
    agreement_id: u64,
    milestone_id: u32,
    client: &Address,
    amount: i128,
) {
    let topics = (symbol_short!("ms_ref"), agreement_id, milestone_id);
    let data = (client.clone(), amount);
    env.events().publish(topics, data);
}

pub fn emit_milestone_cancelled(
    env: &Env,
    agreement_id: u64,
    milestone_id: u32,
) {
    let topics = (symbol_short!("ms_canc"), agreement_id, milestone_id);
    env.events().publish(topics, 0i128);
}
