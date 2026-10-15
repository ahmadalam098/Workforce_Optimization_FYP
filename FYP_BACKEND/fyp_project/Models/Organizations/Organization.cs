using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations.Schema;

namespace fyp_project.Models;

public partial class Organization
{
    public int OrgId { get; set; }

    [NotMapped]
    public int OrganizationId { get => OrgId; set => OrgId = value; }

    public string? OrgName { get; set; }

    public string? Email { get; set; }

    public string? Phone { get; set; }

    public string? Address { get; set; }

    public string? Country { get; set; }

    public string? Status { get; set; }

    public DateTime? CreatedAt { get; set; }

    public DateTime? ApprovedAt { get; set; }

    public string? Password { get; set; }

    public virtual ICollection<AllocationHistory> AllocationHistoryFromOrgs { get; set; } = new List<AllocationHistory>();

    public virtual ICollection<AllocationHistory> AllocationHistoryToOrgs { get; set; } = new List<AllocationHistory>();

    public virtual ICollection<Complaint> Complaints { get; set; } = new List<Complaint>();

    public virtual ICollection<Contract> Contracts { get; set; } = new List<Contract>();

    public virtual ICollection<EmployeeAllocation> EmployeeAllocationAssignOrgs { get; set; } = new List<EmployeeAllocation>();

    public virtual ICollection<EmployeeAllocation> EmployeeAllocationOwnerOrgs { get; set; } = new List<EmployeeAllocation>();

    public virtual ICollection<Employee> Employees { get; set; } = new List<Employee>();

    public virtual ICollection<OrganizationManager> OrganizationManagers { get; set; } = new List<OrganizationManager>();

    public virtual ICollection<OrganizationReview> OrganizationReviews { get; set; } = new List<OrganizationReview>();

    public virtual ICollection<Overtime> Overtimes { get; set; } = new List<Overtime>();

    public virtual ICollection<Report> Reports { get; set; } = new List<Report>();

    public virtual ICollection<WorkforceRequest> WorkforceRequestOrgs { get; set; } = new List<WorkforceRequest>();

    public virtual ICollection<WorkforceRequest> WorkforceRequestRequestByOrgs { get; set; } = new List<WorkforceRequest>();
}
