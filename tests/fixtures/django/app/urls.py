from django.urls import path, re_path
from . import views

urlpatterns = [
    path("books/", views.book_list, name="book-list"),
    re_path(r"^authors/(?P<pk>\d+)$", views.author_detail, name="author-detail"),
]
