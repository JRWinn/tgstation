/**
 * The Quartermaster: head of the supply staff.
 *
 * Every order aboard goes through it. It does not place them: it keeps an order book, on paper
 * it carries, and gives each order to one of its technicians, face to face. This is what its body
 * knows and can do for that: where its office is and where its staff work, the paper it writes
 * on, and the money every order is paid from. What it does with them is the brain's business.
 *
 * The order book is real paper. It starts the shift with a clipboard and nothing on it, and has
 * to go and find a sheet. Anyone who takes the clipboard can read the book, and without it the
 * Quartermaster has no book.
 */

/datum/ai_controller/crew_npc
	/// For a head: name of the room its staff work from, which is where it goes to find them.
	var/staff_post_place
	/// Name of the office of the head the body answers to, if it has one to knock at: for a cargo technician, the Quartermaster's.
	var/head_office_place
	/// The sheets of paper the body keeps its order book on, oldest first, as weak references.
	var/list/book_sheets = list()
	/// Paper bins the body has been to and got nothing from, as weak references.
	var/list/paper_bins_tried = list()
	/// Name of whoever gave the body the order on the go, if it was not whoever the order is for: the Quartermaster.
	var/order_via
	/// The number the order on the go has in the Quartermaster's order book, or null.
	var/order_ref

/// TRUE if the body is the Quartermaster.
/datum/ai_controller/crew_npc/proc/is_quartermaster()
	return !!findtext(job_title(), "Quartermaster")

/**
 * Gives a Quartermaster what it arrives knowing: the way to its office, and to the room its
 * technicians work from. The names of those rooms are added to `known`. Returns the sentences
 * that tell the brain so.
 */
/datum/ai_controller/crew_npc/proc/learn_quartermaster_places(list/known)
	var/list/sentences = list()
	office_place = learn_place(/area/station/command/heads_quarters/qm)
	if(office_place)
		known += office_place
		sentences += "You are the station's Quartermaster, the head of the supply staff. Your office is the [office_place], and you know the way there."
	// Its technicians work from wherever the department's supply console is. Stations name that room differently.
	var/obj/machinery/computer/cargo/console = supply_console()
	var/area/staff_area = console ? get_area(console) : null
	if(staff_area)
		staff_post_place = learn_place(staff_area.type)
		if(staff_post_place)
			known += staff_post_place
			sentences += "Your technicians work from the [staff_post_place], and you know the way there."
	return sentences

/// Works out where a cargo technician knocks for the head it answers to: the Quartermaster's office, if the station has one.
/datum/ai_controller/crew_npc/proc/learn_head_office()
	var/mob/living/carbon/human/body = pawn
	for(var/area/station/command/heads_quarters/qm/office in GLOB.areas)
		if(length(office.get_turfs_by_zlevel(body.z)))
			head_office_place = format_text(office.name)
			return

/// Returns the sheets of the order book that are on the body now, oldest first. One that has been taken or dropped is not in the book.
/datum/ai_controller/crew_npc/proc/order_book_sheets()
	var/list/sheets = list()
	for(var/datum/weakref/sheet_ref as anything in book_sheets)
		var/obj/item/paper/sheet = sheet_ref.resolve()
		if(QDELETED(sheet))
			book_sheets -= sheet_ref
			continue
		if(get_atom_on_turf(sheet) == pawn)
			sheets += sheet
	return sheets

/// Returns the sheet of the order book there is room to write more on, or null if there is none.
/datum/ai_controller/crew_npc/proc/sheet_to_write_on()
	var/list/sheets = order_book_sheets()
	if(!length(sheets))
		return null
	var/obj/item/paper/last_sheet = sheets[length(sheets)]
	return last_sheet.get_total_length() + CREW_NPC_NOTE_ROOM <= MAX_PAPER_LENGTH ? last_sheet : null

/// Returns a pen the body has on it, or null: one in a hand or its bag, on its clipboard, or in its PDA.
/datum/ai_controller/crew_npc/proc/pen_on_body()
	var/mob/living/carbon/human/body = pawn
	return locate(/obj/item/pen) in body.get_all_contents()

/// Takes something the body has on it into a hand, if it is not in one already. Returns FALSE if it has no hand free for it.
/datum/ai_controller/crew_npc/proc/take_in_hand(obj/item/thing)
	var/mob/living/carbon/human/body = pawn
	if(body.is_holding(thing))
		return TRUE
	return body.put_in_hands(thing)

/**
 * Gets the body ready to write on a sheet of its order book the way anyone would: the clipboard
 * the sheet is on, or the loose sheet, out of its bag and in one hand, and a pen in the
 * clipboard's clip or in the other hand. Nothing is written from inside a bag. Returns null if it
 * is ready, or the words for why it cannot be.
 */
/datum/ai_controller/crew_npc/proc/ready_to_write(obj/item/paper/sheet)
	var/obj/item/clipboard/board = sheet.loc
	if(!istype(board))
		board = null
	var/obj/item/held = board || sheet
	if(!take_in_hand(held))
		return "Your hands are full, so you cannot get your [held.name] out to write in it."
	if(board?.pen)
		return null
	var/obj/item/pen/pen = pen_on_body()
	if(isnull(pen))
		return "You have nothing to write with."
	// The pen comes out of wherever it is kept, which for most is the slot in their PDA.
	var/obj/item/modular_computer/pda/kept_in = pen.loc
	if(board)
		pen.forceMove(board)
		board.pen = pen
		board.update_appearance()
	else if(!take_in_hand(pen))
		return "Your hands are full, so you cannot hold a pen to write with."
	if(istype(kept_in) && kept_in.inserted_item == pen)
		kept_in.inserted_item = null
	return null

/// Makes a sheet of paper the next sheet of the order book.
/datum/ai_controller/crew_npc/proc/add_book_sheet(obj/item/paper/sheet)
	book_sheets += WEAKREF(sheet)
	sheet.name = length(book_sheets) > 1 ? "order book, sheet [length(book_sheets)]" : "order book"

/**
 * What is written in the order book, line by line, oldest first. Null if the body is not a
 * Quartermaster, or cannot write in it: it has no sheet, or one with no room left, or no pen.
 */
/datum/ai_controller/crew_npc/proc/order_book_lines()
	if(!is_quartermaster() || isnull(sheet_to_write_on()) || isnull(pen_on_body()))
		return null
	var/list/lines = list()
	for(var/obj/item/paper/sheet as anything in order_book_sheets())
		for(var/datum/paper_input/written as anything in sheet.raw_text_inputs)
			for(var/line in splittext(written.raw_text, "\n"))
				line = trim(line)
				if(length(line))
					lines += line
	return lines

/// Tool: write lines in the order book the body carries. The Quartermaster only.
/datum/ai_controller/crew_npc/proc/tool_note(list/lines)
	var/mob/living/carbon/human/body = pawn
	if(!is_quartermaster())
		action_result(CREW_TOOL_NOTE, FALSE, "Keeping the order book is the Quartermaster's job.")
		return
	if(!islist(lines) || !length(lines))
		action_result(CREW_TOOL_NOTE, FALSE, "You have nothing to write down.")
		return
	// Plain words only: nothing that paper would take for markup, a field to fill in, or a new line.
	var/static/regex/not_plain = regex(@"[<>\[\]\r\n\t]+", "g")
	var/list/to_write = list()
	for(var/line in lines)
		if(!istext(line) || length(to_write) >= CREW_NPC_NOTE_LINES)
			continue
		line = trim(copytext_char(not_plain.Replace(line, " "), 1, CREW_NPC_NOTE_LINE_LENGTH + 1))
		if(length(line) && !is_ic_filtered(line))
			to_write += line
	if(!length(to_write))
		action_result(CREW_TOOL_NOTE, FALSE, "You have nothing to write down.")
		return
	var/obj/item/paper/sheet = sheet_to_write_on()
	if(isnull(sheet))
		action_result(CREW_TOOL_NOTE, FALSE, length(order_book_sheets()) ? "There is no room left on the sheet you keep your order book on. You need another." : "You have nothing to write on.", list("no_paper" = TRUE))
		return
	// Nothing is written from inside a bag, or without something to write with.
	var/why_not = ready_to_write(sheet)
	if(why_not)
		action_result(CREW_TOOL_NOTE, FALSE, why_not, list("no_paper" = TRUE))
		return
	for(var/line in to_write)
		// Each line is its own paragraph: paper runs lines together otherwise.
		sheet.add_raw_text("[line]\n\n")
		log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) wrote in its order book: [line]")
	sheet.update_appearance()
	var/obj/item/clipboard/board = sheet.loc
	if(istype(board))
		board.update_appearance()
	action_result(CREW_TOOL_NOTE, TRUE, "You write [length(to_write) == 1 ? "a line" : "[length(to_write)] lines"] in your order book.")

/**
 * Returns the nearest paper bin that has what the body is short of, that it can walk to and has not
 * already come away from empty-handed, or null. Paper, a pen, or both.
 */
/datum/ai_controller/crew_npc/proc/nearest_paper_bin(need_paper, need_pen)
	var/mob/living/carbon/human/body = pawn
	var/obj/item/paper_bin/nearest
	var/nearest_distance = INFINITY
	for(var/obj/item/paper_bin/bin in world)
		if(!isturf(bin.loc) || bin.z != body.z)
			continue
		if((need_paper && bin.total_paper < 1) || (need_pen && isnull(bin.bin_pen)))
			continue
		if(WEAKREF(bin) in paper_bins_tried)
			continue
		var/area/room = get_area(bin)
		if(!istype(room, /area/station) || locked_out_of(room) || !crew_npc_safe_turf(get_turf(bin)))
			continue
		var/distance = get_dist(body, bin)
		if(distance < nearest_distance)
			nearest_distance = distance
			nearest = bin
	return nearest

/**
 * Tool: go and take a sheet of paper, and the pen kept with it, to keep the order book on. The
 * Quartermaster only. A blank sheet it is already carrying will do.
 */
/datum/ai_controller/crew_npc/proc/tool_get_paper()
	var/mob/living/carbon/human/body = pawn
	if(!is_quartermaster())
		action_result(CREW_TOOL_PAPER, FALSE, "Keeping the order book is the Quartermaster's job.")
		return
	var/need_pen = isnull(pen_on_body())
	if(sheet_to_write_on() && !need_pen)
		action_result(CREW_TOOL_PAPER, TRUE, "You have paper to write on, and a pen, already.")
		return
	if(isnull(sheet_to_write_on()))
		for(var/obj/item/paper/sheet in body.get_all_contents())
			if(sheet.is_empty() && !(WEAKREF(sheet) in book_sheets))
				add_book_sheet(sheet)
				break
		if(sheet_to_write_on() && !need_pen)
			action_result(CREW_TOOL_PAPER, TRUE, "You have a blank sheet of paper on you. It will do to keep your order book on.")
			return
	var/obj/item/paper_bin/bin = nearest_paper_bin(isnull(sheet_to_write_on()), need_pen)
	if(isnull(bin))
		// Every bin has been tried. They are worth another look next time: someone may have filled one.
		paper_bins_tried = list()
		action_result(CREW_TOOL_PAPER, FALSE, need_pen ? "You cannot think where there is a pen to be had, and paper is no use without one." : "You cannot think where there is any paper to be had.")
		return
	start_errand(bin, CREW_TOOL_PAPER, "paper")

/// Takes a sheet from the paper bin the body is standing by, and its pen if the body has none, and clips the sheet to its clipboard if it has one.
/datum/ai_controller/crew_npc/proc/take_paper(obj/item/paper_bin/bin)
	var/mob/living/carbon/human/body = pawn
	var/place = get_area_name(bin, TRUE)
	// A sheet, if it has none it can write on. It may only have come for the pen.
	var/need_sheet = isnull(sheet_to_write_on())
	if(need_sheet && bin.total_paper < 1)
		paper_bins_tried += WEAKREF(bin)
		return list(FALSE, "The paper bin in [place] is empty.")
	var/obj/item/paper/sheet
	if(need_sheet)
		sheet = pop(bin.paper_stack) || bin.generate_paper()
		bin.total_paper -= 1
	var/obj/item/clipboard/board = locate(/obj/item/clipboard) in body.get_all_contents()
	var/obj/item/pen/pen
	if(bin.bin_pen && !(locate(/obj/item/pen) in body.get_all_contents()))
		pen = bin.bin_pen
		bin.bin_pen = null
	bin.update_appearance()
	var/took_pen = !isnull(pen)
	// A sheet is clipped to a clipboard that is in the hand. With no hand free for it, the sheet goes in the bag.
	if(board && !take_in_hand(board))
		board = null
	if(isnull(sheet))
		// It came for the pen alone.
		if(isnull(pen))
			paper_bins_tried += WEAKREF(bin)
			return list(FALSE, "There is no pen kept with the paper bin in [place].")
		if(board && isnull(board.pen))
			pen.forceMove(board)
			board.pen = pen
			board.update_appearance()
		else if(!body.equip_to_storage(pen, ITEM_SLOT_BACK, indirect_action = TRUE) && !body.put_in_hands(pen))
			pen.forceMove(bin)
			bin.bin_pen = pen
			bin.update_appearance()
			paper_bins_tried += WEAKREF(bin)
			return list(FALSE, "Your hands and your bag are full, so you have nowhere to put a pen.")
		return list(TRUE, "You take the pen kept with the paper bin in [place]. Now you have something to write in your order book with.")
	if(board)
		sheet.forceMove(board)
		if(board.top_paper)
			board.UnregisterSignal(board.top_paper, COMSIG_ATOM_UPDATED_ICON)
		board.RegisterSignal(sheet, COMSIG_ATOM_UPDATED_ICON, TYPE_PROC_REF(/obj/item/clipboard, on_top_paper_change))
		board.top_paper = sheet
		if(pen && isnull(board.pen))
			pen.forceMove(board)
			board.pen = pen
			pen = null
		board.update_appearance()
	else if(!body.equip_to_storage(sheet, ITEM_SLOT_BACK, indirect_action = TRUE) && !body.put_in_hands(sheet))
		// Nowhere to put it: it goes back where it came from.
		sheet.forceMove(bin)
		bin.paper_stack += sheet
		bin.total_paper += 1
		if(pen)
			pen.forceMove(bin)
			bin.bin_pen = pen
		bin.update_appearance()
		paper_bins_tried += WEAKREF(bin)
		return list(FALSE, "Your hands and your bag are full, so you have nowhere to put a sheet of paper.")
	// A pen that did not go on the clipboard goes in the bag, or failing that back in the bin.
	if(pen && !body.equip_to_storage(pen, ITEM_SLOT_BACK, indirect_action = TRUE) && !body.put_in_hands(pen))
		pen.forceMove(bin)
		bin.bin_pen = pen
		bin.update_appearance()
		took_pen = FALSE
	add_book_sheet(sheet)
	return list(TRUE, "You take a sheet of paper[took_pen ? " and a pen" : ""] from the paper bin in [place][board ? ", and clip the sheet to your clipboard" : ""]. It is what you keep your order book on.")

/// TRUE if the body carries a PDA with the program heads of staff read the budget and the price of things from.
/datum/ai_controller/crew_npc/proc/has_budget_program()
	var/mob/living/carbon/human/body = pawn
	for(var/obj/item/modular_computer/computer in body.get_equipped_items(INCLUDE_POCKETS | INCLUDE_HELD))
		if(locate(/datum/computer_file/program/budgetorders) in computer.stored_files)
			return TRUE
	return FALSE

/**
 * How many credits are in cargo's budget, which every order is paid from. Null if there is no
 * such account, or the body has no PDA to read it from: it knows the budget the way a head of
 * staff does, from the budget program, and without that it does not know.
 */
/datum/ai_controller/crew_npc/proc/cargo_budget()
	if(!has_budget_program())
		return null
	var/datum/bank_account/department/budget = SSeconomy.get_dep_account(ACCOUNT_CAR)
	return budget ? budget.account_balance : null

/// What one crate of each kind cargo may order costs, in credits, by the name crew know the kind by. Read from the same program as the budget.
/datum/ai_controller/crew_npc/proc/crate_costs()
	var/list/costs = list()
	if(!has_budget_program())
		return costs
	var/list/known = orderable_crates()
	for(var/kind in known)
		var/datum/supply_pack/pack = SSshuttle.supply_packs[known[kind]]
		if(pack)
			costs[kind] = pack.get_cost()
	return costs

/**
 * Tool: note that word the body owed someone about their crates was passed on face to face, to the
 * Quartermaster: that an order has come in, that crates are still waiting, or that one is lost.
 * Whoever the crates are for is then owed no PDA message about it from this body: they hear from
 * the Quartermaster. `kind` is which word it was. Cargo staff only.
 */
/datum/ai_controller/crew_npc/proc/tool_word_passed(person_name, kind)
	if(!istext(person_name) || !works_in_cargo())
		action_result(CREW_TOOL_WORD_PASSED, FALSE, "You owe nobody word about their crates.")
		return
	var/wanted = LOWER_TEXT(trim(person_name))
	for(var/list/notice as anything in notices_owed)
		if(LOWER_TEXT(notice["to"]) == wanted && (!istext(kind) || notice["kind"] == kind))
			notices_owed -= list(notice)
			action_result(CREW_TOOL_WORD_PASSED, TRUE, "You have passed word of it on.")
			return
	action_result(CREW_TOOL_WORD_PASSED, FALSE, "You owe nobody word about their crates.")

/**
 * Tool: open a crate that cargo is holding for the body itself, where it stands. The Quartermaster
 * only: what it orders for itself comes into its own department, so it has no call to collect it
 * at the counter. What was in the crate is left out where it can be got at.
 */
/datum/ai_controller/crew_npc/proc/tool_open_own_crate(number)
	var/mob/living/carbon/human/body = pawn
	var/datum/crew_npc_held_crate/entry = crew_npc_held_by_number(number)
	if(!is_quartermaster() || isnull(entry) || entry.for_name != body.real_name)
		action_result(CREW_TOOL_OPEN_CRATE, FALSE, "Cargo is not holding a crate by that number for you.", list("no_such_crate" = TRUE))
		return
	var/obj/structure/closet/crate/crate = entry.crate_ref.resolve()
	// Opened aboard the shuttle, what is in it would go back with the shuttle.
	if(!entry.held_since)
		action_result(CREW_TOOL_OPEN_CRATE, FALSE, "Crate #[entry.number] has not been hauled off the supply shuttle yet.")
		return
	start_errand(crate, CREW_TOOL_OPEN_CRATE, "crate #[entry.number]")

/// Opens the crate of its own that the body is standing by, and takes it off the list of those being held.
/datum/ai_controller/crew_npc/proc/open_own_crate(obj/structure/closet/crate/crate)
	var/mob/living/carbon/human/body = pawn
	var/datum/crew_npc_held_crate/entry = crew_npc_held_entry(crate)
	if(isnull(entry))
		return list(FALSE, "That crate is not one cargo is holding for you.")
	if(!crate.opened && !crate.open(body))
		return list(FALSE, "Crate #[entry.number] will not open.")
	GLOB.crew_npc_held_crates -= entry
	freight_changed()
	return list(TRUE, "You open crate #[entry.number] in [get_area_name(crate, TRUE)]. What was in it is out where you can get at it.", list("number" = entry.number))
