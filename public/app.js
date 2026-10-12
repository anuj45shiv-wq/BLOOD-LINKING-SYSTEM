const donorForm = document.getElementById("donorForm");
const donorList = document.getElementById("donorList");

const donorName = document.getElementById("donorName");
const bloodGroup = document.getElementById("bloodGroup");
const city = document.getElementById("city");
const phone = document.getElementById("phone");

const searchBloodGroup = document.getElementById("searchBloodGroup");
const searchCity = document.getElementById("searchCity");
const searchBtn = document.getElementById("searchBtn");
const showAllBtn = document.getElementById("showAllBtn");

const formMessage = document.getElementById("formMessage");
const searchMessage = document.getElementById("searchMessage");

const totalDonors = document.getElementById("totalDonors");
const availableDonors = document.getElementById("availableDonors");
const bloodGroupCount = document.getElementById("bloodGroupCount");

async function loadStats() {
    const response = await fetch("/api/stats");
    const stats = await response.json();

    totalDonors.textContent = stats.totalDonors;
    availableDonors.textContent = stats.availableDonors;
    bloodGroupCount.textContent = Object.keys(stats.bloodGroups).length;
}

async function loadDonors() {
    const params = new URLSearchParams();

    if (searchBloodGroup.value) {
        params.set("bloodGroup", searchBloodGroup.value);
    }

    if (searchCity.value.trim()) {
        params.set("city", searchCity.value.trim());
    }

    const response = await fetch(`/api/donors?${params.toString()}`);
    const donors = await response.json();

    renderDonors(donors);
}

function renderDonors(donors) {
    donorList.innerHTML = "";

    if (donors.length === 0) {
        searchMessage.textContent = "No donors found for this search.";
        return;
    }

    searchMessage.textContent = `${donors.length} donor(s) found.`;

    donors.forEach(donor => {
        const card = document.createElement("article");
        card.className = "donor-card";

        card.innerHTML = `
            <span class="blood-badge">${donor.bloodGroup}</span>
            <h3>${escapeHtml(donor.name)}</h3>
            <p>📍 ${escapeHtml(donor.city)}</p>
            <p>📞 ${escapeHtml(donor.phone)}</p>
            <p class="${donor.available ? "available" : "unavailable"}">
                ${donor.available ? "● Available" : "● Currently unavailable"}
            </p>

            <div class="card-actions">
                <button class="small-btn availability-btn"
                        data-id="${donor.id}"
                        data-available="${donor.available}">
                    ${donor.available ? "Mark Unavailable" : "Mark Available"}
                </button>

                <button class="small-btn delete-btn" data-id="${donor.id}">
                    Delete
                </button>
            </div>
        `;

        donorList.appendChild(card);
    });

    document.querySelectorAll(".availability-btn").forEach(button => {
        button.addEventListener("click", updateAvailability);
    });

    document.querySelectorAll(".delete-btn").forEach(button => {
        button.addEventListener("click", deleteDonor);
    });
}

async function registerDonor(event) {
    event.preventDefault();

    formMessage.textContent = "Registering...";

    const donor = {
        name: donorName.value.trim(),
        bloodGroup: bloodGroup.value,
        city: city.value.trim(),
        phone: phone.value.trim()
    };

    try {
        const response = await fetch("/api/donors", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(donor)
        });

        const result = await response.json();

        if (!response.ok) {
            formMessage.textContent = result.message;
            return;
        }

        formMessage.textContent = "Donor registered successfully!";
        donorForm.reset();

        await loadStats();
        await loadDonors();
    } catch (error) {
        formMessage.textContent = "Server error. Is the backend running?";
    }
}

async function updateAvailability(event) {
    const id = event.target.dataset.id;
    const currentAvailability = event.target.dataset.available === "true";

    const response = await fetch(`/api/donors/${id}/availability`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            available: !currentAvailability
        })
    });

    if (response.ok) {
        await loadStats();
        await loadDonors();
    }
}

async function deleteDonor(event) {
    const id = event.target.dataset.id;

    const shouldDelete = confirm("Are you sure you want to delete this donor?");
    if (!shouldDelete) {
        return;
    }

    const response = await fetch(`/api/donors/${id}`, {
        method: "DELETE"
    });

    if (response.ok) {
        await loadStats();
        await loadDonors();
    }
}

function escapeHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

donorForm.addEventListener("submit", registerDonor);
searchBtn.addEventListener("click", loadDonors);
showAllBtn.addEventListener("click", () => {
    searchBloodGroup.value = "";
    searchCity.value = "";
    loadDonors();
});

loadStats();
loadDonors();
